const mongoose = require('mongoose');

// Colunas padrão do kanban (as mesmas usadas hoje). Na Fase 2 o dono
// da empresa poderá adicionar/remover/reordenar essas colunas.
const COLUNAS_PADRAO = [
  { id: 'aguardando_retorno_fabrica', titulo: 'Aguardando Retorno da Fábrica', cor: '#f97316', ordem: 0 },
  { id: 'aguardando_retorno_cliente', titulo: 'Aguardando Retorno do Cliente', cor: '#ec4899', ordem: 1 },
  { id: 'aguardando_nf_cliente',      titulo: 'Aguardando NF do Cliente',      cor: '#a78bfa', ordem: 2 },
  { id: 'aguardando_nf_fabrica',      titulo: 'Aguardando NF da Fábrica',      cor: '#f59e0b', ordem: 3 },
  { id: 'aguardando_desconto',        titulo: 'Aguardando Desconto',           cor: '#dc2626', ordem: 4 },
  { id: 'credito_compras_futuras',    titulo: 'Crédito p/ Compras Futuras',    cor: '#ea580c', ordem: 5 },
  { id: 'resolvido_finalizado',       titulo: 'Resolvido/Finalizado',          cor: '#059669', ordem: 6 },
];

// Campos padrão de uma demanda (os mesmos exibidos hoje). Na Fase 2 o dono
// poderá marcar (checkboxes) quais campos quer e criar campos novos.
const CAMPOS_PADRAO = [
  { key: 'nomeCliente',  label: 'Cliente',         tipo: 'texto', obrigatorio: true,  ordem: 0, ativo: true },
  { key: 'cnpj',         label: 'CNPJ',            tipo: 'texto', obrigatorio: false, ordem: 1, ativo: true },
  { key: 'dataCriacao',  label: 'Aberto em',       tipo: 'data',  obrigatorio: false, ordem: 2, ativo: true },
  { key: 'razaoSocial',  label: 'Nome do Contato', tipo: 'texto', obrigatorio: false, ordem: 3, ativo: true },
  { key: 'contato',      label: 'Contato',         tipo: 'texto', obrigatorio: false, ordem: 4, ativo: true },
  { key: 'cidade',       label: 'Cidade',          tipo: 'texto', obrigatorio: false, ordem: 5, ativo: true },
  { key: 'marca',        label: 'Marca',           tipo: 'texto', obrigatorio: true,  ordem: 6, ativo: true },
  { key: 'representante', label: 'Representante',  tipo: 'texto', obrigatorio: false, ordem: 7, ativo: true },
  { key: 'valor',        label: 'Valor Total',     tipo: 'moeda', obrigatorio: false, ordem: 8, ativo: true },
];

const ColunaSchema = new mongoose.Schema({
  id:     { type: String, required: true },
  titulo: { type: String, required: true },
  cor:    { type: String, default: '#64748b' },
  ordem:  { type: Number, default: 0 },
}, { _id: false });

const CampoSchema = new mongoose.Schema({
  key:         { type: String, required: true },
  label:       { type: String, required: true },
  tipo:        { type: String, default: 'texto' }, // texto | numero | data | moeda | selecao
  obrigatorio: { type: Boolean, default: false },
  ordem:       { type: Number, default: 0 },
  ativo:       { type: Boolean, default: true },
  opcoes:      { type: [String], default: [] },    // usado quando tipo = selecao
}, { _id: false });

const EmpresaSchema = new mongoose.Schema({
  nome:   { type: String, required: true, trim: true },
  plano:  { type: String, default: 'gratis' },   // gratis | sv+ | sr+
  status: { type: String, default: 'ativo' },    // ativo | trial | suspenso
  // Configuração do kanban/demandas (semeada com o padrão; editável na Fase 2)
  colunas:       { type: [ColunaSchema], default: () => COLUNAS_PADRAO },
  camposDemanda: { type: [CampoSchema],  default: () => CAMPOS_PADRAO },
}, {
  timestamps: true
});

const Empresa = mongoose.model('Empresa', EmpresaSchema);

module.exports = Empresa;
module.exports.COLUNAS_PADRAO = COLUNAS_PADRAO;
module.exports.CAMPOS_PADRAO = CAMPOS_PADRAO;
