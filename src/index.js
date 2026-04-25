require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createServer } = require('http');
const { Server } = require('socket.io');

const Demanda = require('./models/Demanda');
const User = require('./models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'somma-crm-secret-key-dev';

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

// Rotas de Autenticação

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
    }

    const existente = await User.findOne({ email: email.toLowerCase() });
    if (existente) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const hash = await bcrypt.hash(senha, 10);
    const user = await User.create({ nome, email, senha: hash });

    const token = jwt.sign(
      { id: user._id, nome: user.nome, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, usuario: { id: user._id, nome: user.nome, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const token = jwt.sign(
      { id: user._id, nome: user.nome, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, usuario: { id: user._id, nome: user.nome, email: user.email } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar token
app.get('/api/auth/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ usuario: { id: payload.id, nome: payload.nome, email: payload.email } });
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
});

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
