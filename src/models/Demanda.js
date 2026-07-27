const mongoose = require('mongoose');

const DemandaSchema = new mongoose.Schema({
  // Multi-tenant: a qual empresa esta demanda pertence
  empresaId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nomeCliente:      { type: String, required: true },
  cnpj:             { type: String, default: '' },
  razaoSocial:      { type: String, default: '' },
  fantasia:         { type: String, default: '' },
  contato:          { type: String, default: '' },
  cidade:           { type: String, default: '' },
  representante:    { type: String, default: '' },
  marca:            { type: String, required: true },
  valor:            { type: String, default: '' },
  dataCriacao:      { type: String, default: '' },
  dataContato:      { type: String, default: () => new Date().toISOString().split('T')[0] },
  // enum removido de propósito: na Fase 2 cada empresa define seus próprios
  // tipos/colunas, então a validação passa a ser por empresa (não no schema).
  tipoProblema:     { type: String, default: 'outros' },
  encaminhadoPara:  { type: String, default: '-' },
  status:           { type: String, required: true, default: 'aguardando_retorno_fabrica' },
  prioridade:       { type: String, required: true, default: 'media' },
  // Valores de campos criados pelo próprio cliente (Fase 2)
  camposCustom:     { type: mongoose.Schema.Types.Mixed, default: {} },
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
