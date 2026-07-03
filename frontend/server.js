const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Frontend a correr em http://localhost:${PORT}`));
