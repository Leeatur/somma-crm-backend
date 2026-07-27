const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  senha: { type: String, required: true },
  // Multi-tenant: a qual empresa este usuário pertence
  empresaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', index: true },
  papel: { type: String, default: 'membro' }, // dono | membro
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
