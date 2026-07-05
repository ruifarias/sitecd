const express = require('express');
const path = require('path');

const app = express();
// Sem cache para JS/CSS/HTML: o site está em desenvolvimento activo e o browser
// não deve reter versões antigas destes ficheiros entre sessões (já causou
// confusão - ex: botão que "não fazia nada" por o browser ter o JS antigo em cache).
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Frontend a correr em http://localhost:${PORT}`));
