require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const Demanda = require('./models/Demanda');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Conexão com MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/somma-crm';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Conectado ao MongoDB'))
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Rotas API

// Listar todas as demandas
app.get('/api/demandas', async (req, res) => {
  try {
    const demandas = await Demanda.find().sort({ createdAt: -1 });
    res.json(demandas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar nova demanda
app.post('/api/demandas', async (req, res) => {
  try {
    const { usuario, ...dados } = req.body;
    
    const demanda = new Demanda({
      ...dados,
      historico: [{
        acao: 'CRIAÇÃO',
        usuario: usuario || 'Sistema',
        data: new Date(),
        campoAlterado: '-',
        valorAnterior: '-',
        valorNovo: 'Demanda criada'
      }],
      ultimaAlteracaoPor: usuario || 'Sistema',
      ultimaAlteracaoEm: new Date()
    });
    
    await demanda.save();
    
    // Notificar todos os clientes conectados
    io.emit('demanda:criada', demanda);
    
    res.status(201).json(demanda);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar demanda
app.put('/api/demandas/:id', async (req, res) => {
  try {
    const { usuario, ...dados } = req.body;
    const demandaAntiga = await Demanda.findById(req.params.id);
    
    if (!demandaAntiga) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }
    
    // Criar histórico de alterações
    const alteracoes = [];
    Object.keys(dados).forEach(campo => {
      if (demandaAntiga[campo] !== dados[campo] && campo !== 'historico') {
        alteracoes.push({
          acao: 'ALTERAÇÃO',
          usuario: usuario || 'Sistema',
          data: new Date(),
          campoAlterado: campo,
          valorAnterior: String(demandaAntiga[campo] || '-'),
          valorNovo: String(dados[campo] || '-')
        });
      }
    });
    
    const demanda = await Demanda.findByIdAndUpdate(
      req.params.id,
      {
        ...dados,
        $push: { historico: { $each: alteracoes } },
        ultimaAlteracaoPor: usuario || 'Sistema',
        ultimaAlteracaoEm: new Date()
      },
      { new: true }
    );
    
    // Notificar todos os clientes conectados
    io.emit('demanda:atualizada', demanda);
    
    res.json(demanda);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir demanda
app.delete('/api/demandas/:id', async (req, res) => {
  try {
    const { usuario } = req.body;
    const demanda = await Demanda.findByIdAndDelete(req.params.id);
    
    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }
    
    // Notificar todos os clientes conectados
    io.emit('demanda:excluida', { id: req.params.id, usuario: usuario || 'Sistema' });
    
    res.json({ message: 'Demanda excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter estatísticas
app.get('/api/estatisticas', async (req, res) => {
  try {
    const total = await Demanda.countDocuments();
    const pendentes = await Demanda.countDocuments({ status: 'pendente' });
    const resolvidos = await Demanda.countDocuments({ status: 'resolvido' });
    const urgentes = await Demanda.countDocuments({ prioridade: 'urgente' });
    const altaPrioridade = await Demanda.countDocuments({ prioridade: 'alta' });
    
    const taxaResolucao = total > 0 ? Math.round((resolvidos / total) * 100) : 0;
    
    res.json({
      total,
      pendentes,
      resolvidos,
      urgentes,
      altaPrioridade,
      taxaResolucao
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io - Conexões em tempo real
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
  
  // Usuário identifica-se
  socket.on('usuario:identificar', (nome) => {
    socket.nomeUsuario = nome;
    console.log(`👤 Usuário identificado: ${nome}`);
    socket.broadcast.emit('usuario:entrou', { nome, socketId: socket.id });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 API disponível em: http://localhost:${PORT}/api`);
});
