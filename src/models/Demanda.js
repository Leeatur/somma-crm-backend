const mongoose = require('mongoose');

const DemandaSchema = new mongoose.Schema({
  nomeCliente:      { type: String, required: true },
  cnpj:             { type: String, default: '' },
  razaoSocial:      { type: String, default: '' },
  fantasia:         { type: String, default: '' },
  contato:          { type: String, default: '' },
  cidade:           { type: String, default: '' },
  representante:    { type: String, default: '' },
  marca:            { type: String, required: true },
  valor:            { type: String, default: '' },
  dataContato:      { type: String, default: () => new Date().toISOString().split('T')[0] },
  tipoProblema: {
    type: String,
    default: 'outros',
    enum: ['devolucao_defeito', 'devolucao_atraso', 'devolucao_desconformidade',
           'devolucao_outros', 'segunda_via_boleto', 'segunda_via_nf',
           'peca_defeito', 'troca_mercadoria', 'outros']
  },
  encaminhadoPara:  { type: String, default: '-' },
  status: {
    type: String,
    required: true,
    default: 'aguardando_retorno_fabrica',
    enum: ['aguardando_retorno_fabrica', 'aguardando_retorno_cliente', 'aguardando_nf_cliente',
           'aguardando_nf_fabrica', 'aguardando_desconto', 'credito_compras_futuras', 'resolvido_finalizado']
  },
  prioridade: {
    type: String,
    required: true,
    default: 'media',
    enum: ['baixa', 'media', 'alta', 'urgente']
  },
  observacoes:          { type: String, default: '' },
  numeroNFDevolucao:    { type: String, default: '' },
  dataRecebimentoNF:    { type: String, default: '' },
  dataResolucao:        { type: String },
  historico: [{
    acao:           String,
    usuario:        String,
    data:           { type: Date, default: Date.now },
    campoAlterado:  String,
    valorAnterior:  String,
    valorNovo:      String
  }],
  ultimaAlteracaoPor:   { type: String },
  ultimaAlteracaoEm:    { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model('Demanda', DemandaSchema);
