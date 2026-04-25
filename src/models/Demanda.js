const mongoose = require('mongoose');

const DemandaSchema = new mongoose.Schema({
  nomeCliente: { type: String, required: true },
  razaoSocial: { type: String },
  fantasia: { type: String },
  contato: { type: String },
  cidade: { type: String },
  marca: { type: String, required: true },
  dataContato: { type: String, required: true },
  tipoProblema: { 
    type: String, 
    required: true,
    enum: ['devolucao_defeito', 'devolucao_atraso', 'devolucao_desconformidade', 'devolucao_outros', 'segunda_via_boleto', 'segunda_via_nf', 'peca_defeito', 'troca_mercadoria', 'outros']
  },
  encaminhadoPara: { type: String, required: true },
  status: { 
    type: String, 
    required: true,
    enum: ['pendente', 'encaminhado_fabrica', 'aguardando_retorno', 'solicitacao_nf_devolucao', 'nf_enviada_cliente', 'resolvido_parcial', 'resolvido']
  },
  prioridade: { 
    type: String, 
    required: true,
    enum: ['baixa', 'media', 'alta', 'urgente']
  },
  observacoes: { type: String, default: '' },
  numeroNFDevolucao: { type: String },
  dataRecebimentoNF: { type: String },
  dataResolucao: { type: String },
  // Controle de alterações
  historico: [{
    acao: String,
    usuario: String,
    data: { type: Date, default: Date.now },
    campoAlterado: String,
    valorAnterior: String,
    valorNovo: String
  }],
  ultimaAlteracaoPor: { type: String },
  ultimaAlteracaoEm: { type: Date }
}, {
  timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

module.exports = mongoose.model('Demanda', DemandaSchema);
