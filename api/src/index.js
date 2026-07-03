require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const artigosRouter = require('./routes/artigos');
const carrinhoRouter = require('./routes/carrinho');
const encomendasRouter = require('./routes/encomendas');
const filtrosRouter = require('./routes/filtros');
const adminRouter = require('./routes/admin');

// rede de segurança: regista e mantém o processo vivo em vez de rebentar
// silenciosamente (mesma causa suspeita da queda de 2026-07-02 - ver db.js)
process.on('unhandledRejection', (err) => {
  console.error('Promise rejeitada sem tratamento:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Excepção não apanhada:', err);
});

const app = express();
app.use(cors());
app.use(express.json());

app.use('/imagens', express.static(path.resolve(__dirname, '..', '..', 'storage', 'imagens')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/artigos', artigosRouter);
app.use('/api/carrinho', carrinhoRouter);
app.use('/api/encomendas', encomendasRouter);
app.use('/api', filtrosRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API a correr em http://localhost:${PORT}`);
});
