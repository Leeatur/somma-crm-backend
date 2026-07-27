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
const Empresa = require('./models/Empresa');

const JWT_SECRET = process.env.JWT_SECRET || 'somma-crm-secret-key-dev';

// Gera o token com a empresa embutida
function gerarToken(user) {
  return jwt.sign(
    { id: user._id, nome: user.nome, email: user.email, empresaId: user.empresaId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Middleware: exige login e resolve a empresa do usuário (a partir do banco,
// então tokens antigos — sem empresaId — continuam funcionando após a migração).
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }
    const payload = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const user = await User.findById(payload.id).select('_id nome email empresaId papel');
    if (!user || !user.empresaId) {
      return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    }
    req.user = user;
    req.empresaId = user.empresaId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

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
  .then(() => {
    console.log('✅ Conectado ao MongoDB');
    return migrarMultitenant();
  })
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Migração idempotente e NÃO destrutiva: leva as demandas/usuários que ainda
// não têm empresa para a empresa "Somma Força de Vendas". Nada é apagado.
async function migrarMultitenant() {
  try {
    const demandasSemEmpresa = await Demanda.countDocuments({ empresaId: { $exists: false } });
    const usersSemEmpresa = await User.countDocuments({ empresaId: { $exists: false } });
    if (demandasSemEmpresa === 0 && usersSemEmpresa === 0) return;

    console.log(`🔄 Migração multi-tenant: ${demandasSemEmpresa} demandas e ${usersSemEmpresa} usuários sem empresa`);

    let empresa = await Empresa.findOne({ nome: 'Somma Força de Vendas' });
    if (!empresa) {
      empresa = await Empresa.create({ nome: 'Somma Força de Vendas', plano: 'sv+', status: 'ativo' });
      console.log(`🏢 Empresa "Somma Força de Vendas" criada (${empresa._id})`);
    }

    if (demandasSemEmpresa > 0) {
      await Demanda.updateMany({ empresaId: { $exists: false } }, { $set: { empresaId: empresa._id } });
    }
    if (usersSemEmpresa > 0) {
      // primeiro usuário migrado vira dono; os demais, membros
      const users = await User.find({ empresaId: { $exists: false } }).sort({ createdAt: 1 });
      for (let i = 0; i < users.length; i++) {
        users[i].empresaId = empresa._id;
        users[i].papel = i === 0 ? 'dono' : 'membro';
        await users[i].save();
      }
    }
    console.log('✅ Migração multi-tenant concluída — nada foi apagado');
  } catch (err) {
    console.error('❌ Erro na migração multi-tenant:', err);
  }
}

// Rotas de Autenticação

// Registro
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, email, senha, empresaNome } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
    }
    if (!empresaNome || !empresaNome.trim()) {
      return res.status(400).json({ error: 'O nome da empresa é obrigatório.' });
    }

    const existente = await User.findOne({ email: email.toLowerCase() });
    if (existente) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    // Self-signup: cria uma empresa nova e o usuário como dono dela
    const empresa = await Empresa.create({ nome: empresaNome.trim(), plano: 'gratis', status: 'ativo' });

    const hash = await bcrypt.hash(senha, 10);
    const user = await User.create({ nome, email, senha: hash, empresaId: empresa._id, papel: 'dono' });

    const token = gerarToken(user);
    res.status(201).json({
      token,
      usuario: { id: user._id, nome: user.nome, email: user.email, empresaId: empresa._id, papel: 'dono' },
      empresa: { id: empresa._id, nome: empresa.nome },
    });
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

    const empresa = user.empresaId ? await Empresa.findById(user.empresaId).select('nome') : null;
    const token = gerarToken(user);
    res.json({
      token,
      usuario: { id: user._id, nome: user.nome, email: user.email, empresaId: user.empresaId, papel: user.papel },
      empresa: empresa ? { id: empresa._id, nome: empresa.nome } : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verificar token
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id).select('_id nome email empresaId papel');
    if (!user) return res.status(401).json({ error: 'Sessão inválida.' });
    const empresa = user.empresaId ? await Empresa.findById(user.empresaId).select('nome') : null;
    res.json({
      usuario: { id: user._id, nome: user.nome, email: user.email, empresaId: user.empresaId, papel: user.papel },
      empresa: empresa ? { id: empresa._id, nome: empresa.nome } : null,
    });
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
});

// Rotas API

// Sala do socket para uma empresa
const salaEmpresa = (empresaId) => `empresa:${empresaId}`;

// ── Equipe (usuários da mesma empresa) ──

// Listar a equipe da empresa
app.get('/api/equipe', requireAuth, async (req, res) => {
  try {
    const membros = await User.find({ empresaId: req.empresaId })
      .select('nome email papel createdAt').sort({ createdAt: 1 });
    res.json(membros.map(m => ({ id: m._id, nome: m.nome, email: m.email, papel: m.papel })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar uma pessoa à empresa (somente o dono)
app.post('/api/equipe', requireAuth, async (req, res) => {
  try {
    if (req.user.papel !== 'dono') {
      return res.status(403).json({ error: 'Apenas o dono pode adicionar pessoas.' });
    }
    const { nome, email, senha, papel } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (String(senha).length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }
    const existe = await User.findOne({ email: String(email).toLowerCase() });
    if (existe) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    const hash = await bcrypt.hash(senha, 10);
    const novo = await User.create({
      nome, email, senha: hash,
      empresaId: req.empresaId,
      papel: papel === 'dono' ? 'dono' : 'membro',
    });
    res.status(201).json({ id: novo._id, nome: novo.nome, email: novo.email, papel: novo.papel });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remover uma pessoa da empresa (somente o dono; não pode remover a si mesmo)
app.delete('/api/equipe/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.papel !== 'dono') {
      return res.status(403).json({ error: 'Apenas o dono pode remover pessoas.' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'Você não pode remover a si mesmo.' });
    }
    const alvo = await User.findOne({ _id: req.params.id, empresaId: req.empresaId });
    if (!alvo) return res.status(404).json({ error: 'Pessoa não encontrada.' });
    await User.deleteOne({ _id: alvo._id });
    res.json({ message: 'Pessoa removida da equipe.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Configuração da empresa (colunas + campos das demandas) ──

// Ler a config da própria empresa
app.get('/api/empresa', requireAuth, async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.empresaId);
    if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json({
      id: empresa._id,
      nome: empresa.nome,
      colunas: empresa.colunas || [],
      camposDemanda: empresa.camposDemanda || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Salvar a config (somente o dono da empresa pode editar)
app.put('/api/empresa', requireAuth, async (req, res) => {
  try {
    if (req.user.papel !== 'dono') {
      return res.status(403).json({ error: 'Apenas o dono da empresa pode alterar a configuração.' });
    }
    const { colunas, camposDemanda } = req.body;
    const update = {};

    if (Array.isArray(colunas)) {
      const limpas = colunas
        .filter(c => c && (c.titulo || c.id))
        .map((c, i) => ({
          id: (c.id || c.titulo || `col_${i}`).toString(),
          titulo: (c.titulo || c.id || `Coluna ${i + 1}`).toString(),
          cor: (c.cor || '#64748b').toString(),
          ordem: typeof c.ordem === 'number' ? c.ordem : i,
        }));
      if (limpas.length === 0) {
        return res.status(400).json({ error: 'A empresa precisa de pelo menos uma coluna.' });
      }
      update.colunas = limpas;
    }

    if (Array.isArray(camposDemanda)) {
      const limpos = camposDemanda
        .filter(c => c && (c.label || c.key))
        .map((c, i) => ({
          key: (c.key || c.label || `campo_${i}`).toString(),
          label: (c.label || c.key || `Campo ${i + 1}`).toString(),
          tipo: (c.tipo || 'texto').toString(),
          obrigatorio: !!c.obrigatorio,
          ordem: typeof c.ordem === 'number' ? c.ordem : i,
          ativo: c.ativo !== false,
          opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(String) : [],
        }));
      update.camposDemanda = limpos;
    }

    const empresa = await Empresa.findByIdAndUpdate(req.empresaId, update, { new: true });
    io.to(salaEmpresa(req.empresaId)).emit('empresa:configatualizada', {
      colunas: empresa.colunas, camposDemanda: empresa.camposDemanda,
    });
    res.json({
      id: empresa._id,
      nome: empresa.nome,
      colunas: empresa.colunas || [],
      camposDemanda: empresa.camposDemanda || [],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar demandas DA EMPRESA do usuário logado
app.get('/api/demandas', requireAuth, async (req, res) => {
  try {
    const demandas = await Demanda.find({ empresaId: req.empresaId }).sort({ createdAt: -1 });
    res.json(demandas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar nova demanda (sempre vinculada à empresa do usuário)
app.post('/api/demandas', requireAuth, async (req, res) => {
  try {
    const { usuario, empresaId: _ignore, ...dados } = req.body;

    const demanda = new Demanda({
      ...dados,
      empresaId: req.empresaId,
      historico: [{
        acao: 'CRIAÇÃO',
        usuario: usuario || req.user.nome || 'Sistema',
        data: new Date(),
        campoAlterado: '-',
        valorAnterior: '-',
        valorNovo: 'Demanda criada'
      }],
      ultimaAlteracaoPor: usuario || req.user.nome || 'Sistema',
      ultimaAlteracaoEm: new Date()
    });

    await demanda.save();

    // Notificar apenas os clientes conectados da MESMA empresa
    io.to(salaEmpresa(req.empresaId)).emit('demanda:criada', demanda);

    res.status(201).json(demanda);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar demanda (apenas se pertencer à empresa do usuário)
app.put('/api/demandas/:id', requireAuth, async (req, res) => {
  try {
    const { usuario, empresaId: _ignore, ...dados } = req.body;
    const demandaAntiga = await Demanda.findOne({ _id: req.params.id, empresaId: req.empresaId });

    if (!demandaAntiga) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Criar histórico de alterações
    const alteracoes = [];
    Object.keys(dados).forEach(campo => {
      if (demandaAntiga[campo] !== dados[campo] && campo !== 'historico') {
        alteracoes.push({
          acao: 'ALTERAÇÃO',
          usuario: usuario || req.user.nome || 'Sistema',
          data: new Date(),
          campoAlterado: campo,
          valorAnterior: String(demandaAntiga[campo] || '-'),
          valorNovo: String(dados[campo] || '-')
        });
      }
    });

    const demanda = await Demanda.findOneAndUpdate(
      { _id: req.params.id, empresaId: req.empresaId },
      {
        ...dados,
        $push: { historico: { $each: alteracoes } },
        ultimaAlteracaoPor: usuario || req.user.nome || 'Sistema',
        ultimaAlteracaoEm: new Date()
      },
      { new: true }
    );

    io.to(salaEmpresa(req.empresaId)).emit('demanda:atualizada', demanda);

    res.json(demanda);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir demanda (apenas se pertencer à empresa do usuário)
app.delete('/api/demandas/:id', requireAuth, async (req, res) => {
  try {
    const { usuario } = req.body;
    const demanda = await Demanda.findOneAndDelete({ _id: req.params.id, empresaId: req.empresaId });

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    io.to(salaEmpresa(req.empresaId)).emit('demanda:excluida', { id: req.params.id, usuario: usuario || req.user.nome || 'Sistema' });

    res.json({ message: 'Demanda excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter estatísticas DA EMPRESA
app.get('/api/estatisticas', requireAuth, async (req, res) => {
  try {
    const filtro = { empresaId: req.empresaId };
    const total = await Demanda.countDocuments(filtro);
    const resolvidos = await Demanda.countDocuments({ ...filtro, status: 'resolvido_finalizado' });
    const pendentes = total - resolvidos;
    const urgentes = await Demanda.countDocuments({ ...filtro, prioridade: 'urgente' });
    const altaPrioridade = await Demanda.countDocuments({ ...filtro, prioridade: 'alta' });

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

// Socket.io - Conexões em tempo real (isoladas por empresa)
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });

  // Usuário identifica-se com o token → entra na sala da própria empresa.
  // Aceita { token, nome } (novo) ou uma string com o nome (compatibilidade).
  socket.on('usuario:identificar', async (payload) => {
    try {
      const dados = typeof payload === 'string' ? { nome: payload } : (payload || {});
      socket.nomeUsuario = dados.nome;

      if (dados.token) {
        const jwtPayload = jwt.verify(dados.token, JWT_SECRET);
        const user = await User.findById(jwtPayload.id).select('empresaId nome');
        if (user && user.empresaId) {
          const sala = salaEmpresa(user.empresaId);
          socket.join(sala);
          socket.empresaId = String(user.empresaId);
          console.log(`👤 ${user.nome} entrou na sala ${sala}`);
          // Avisa só a própria empresa
          socket.to(sala).emit('usuario:entrou', { nome: user.nome, socketId: socket.id });
        }
      }
    } catch (err) {
      console.warn('⚠️ Falha ao identificar socket:', err.message);
    }
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
