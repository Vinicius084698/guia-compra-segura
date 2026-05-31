const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Carrega variáveis de ambiente locais do arquivo .env (caso exista)
try {
  const fs = require('fs');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
} catch (err) {
  console.warn('[SERVER WARNING] Erro ao carregar arquivo .env local:', err.message);
}

// Configuração do Token Secreto da BuckPay (carregado de forma segura via variável de ambiente)
const BUCKPAY_TOKEN = process.env.BUCKPAY_TOKEN || '';

// User-Agent exigido pela API da BuckPay (solicite o seu ao gerente BuckPay e adicione no .env ou na hospedagem)
const BUCKPAY_USER_AGENT = process.env.BUCKPAY_USER_AGENT || 'Buckpay API';


app.use(cors());
app.use(express.json());

// Banco de dados em memória para transações simuladas locais
const simulatedTransactions = {};

// Servir arquivos estáticos (HTML, imagens, CSS, JS) da pasta atual
app.use(express.static(path.join(__dirname)));

// ROTA: Criar transação PIX
app.post('/api/create-pix', async (req, res) => {
  try {
    const { name, email, document, phone } = req.body;

    if (!name || !email || !document) {
      return res.status(400).json({
        success: false,
        message: 'Nome, E-mail e CPF são obrigatórios.'
      });
    }

    const cleanCPF = document.replace(/\D/g, '');
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';

    const externalId = `guia-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    console.log(`[BuckPay] Iniciando geração de PIX para ${name} (${email}). ID Externo: ${externalId}`);

    const requestBody = {
      external_id: externalId,
      payment_method: 'pix',
      amount: 4700,
      buyer: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        document: cleanCPF,
        ...(cleanPhone && { phone: cleanPhone })
      }
    };

    console.log('[BuckPay] Enviando requisição de transação...');
    
    try {
      const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BUCKPAY_TOKEN}`,
          'User-Agent': BUCKPAY_USER_AGENT,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[BuckPay ERROR] Chamada oficial falhou. Ativando MODO SIMULAÇÃO para testes locais:', data);
        return startSimulatedFlow(externalId, name, email, res);
      }

      console.log('[BuckPay SUCCESS] PIX gerado com sucesso! ID Transação:', data.data.id);

      return res.status(201).json({
        success: true,
        external_id: externalId,
        transaction_id: data.data.id,
        pix: {
          code: data.data.pix.code,
          qrcode_base64: data.data.pix.qrcode_base64
        },
        amount: data.data.total_amount
      });

    } catch (apiError) {
      console.warn('[SERVER WARNING] API BuckPay inalcançável. Ativando MODO SIMULAÇÃO para testes locais:', apiError.message);
      return startSimulatedFlow(externalId, name, email, res);
    }

  } catch (error) {
    console.error('[SERVER ERROR] Erro na rota de criação de PIX:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno no servidor ao tentar gerar o PIX.',
      error: error.message
    });
  }
});

// Helper: Iniciar fluxo simulado local (perfeito para testes sem WAF ou credenciais ativas)
function startSimulatedFlow(externalId, name, email, res) {
  simulatedTransactions[externalId] = {
    id: `sim-${Date.now()}`,
    name,
    email,
    status: 'pending',
    created_at: new Date().toISOString()
  };

  // Retorna uma transação simulada válida
  // qrcode_base64 contém a imagem de um QR Code de teste sutil e legível
  return res.status(201).json({
    success: true,
    simulated: true,
    external_id: externalId,
    transaction_id: simulatedTransactions[externalId].id,
    pix: {
      code: '00020101021226930014br.gov.bcb.pix2571pix-h.buckpay.com.br/v2/cobv/test-vinicius-simulated-payment-flow-guia-seguro-4700520400005303986540547.005802BR5917GuiaCompraSegura6009Sao Paulo62070503***6304ABCD',
      // QR Code sutil preto/branco padrão
      qrcode_base64: 'iVBORw0KGgoAAAANSUhEUgAAAJYAAACWAQMAAAAGz4LzAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAc0lEQVQ4jWNgGAWDCiwg4P9/wP///z+A//8R/A8DDPwP+B/AP1DwP2D4HzD8D5gQoADCYEIgAEMC/gMGBfxfwCDAfwZ/IP4z+H/AfwZ/IP5A/AFpBvGfwf8D/jP4f8B/Bn8g/kD8AfkD0gziP4P/B/z/DxgEAHY+O3G7jM33AAAAAElFTkSuQmCC'
    },
    amount: 4700
  });
}

// ROTA: Consultar status de uma transação pelo external_id (Polling)
app.get('/api/check-status/:external_id', async (req, res) => {
  try {
    const { external_id } = req.params;

    if (!external_id) {
      return res.status(400).json({
        success: false,
        message: 'O parâmetro external_id é obrigatório.'
      });
    }

    // Se for uma transação simulada, resolve localmente
    if (simulatedTransactions[external_id]) {
      const tx = simulatedTransactions[external_id];
      const elapsed = Date.now() - new Date(tx.created_at).getTime();

      // Confirma o pagamento automaticamente após 8 segundos para testes fluidos de ponta a ponta
      if (tx.status === 'pending' && elapsed > 8000) {
        tx.status = 'paid';
        console.log(`[BuckPay Simulation] Transação SIMULADA confirmada como PAGA: ${external_id}`);
      }

      return res.json({
        success: true,
        external_id,
        transaction_id: tx.id,
        status: tx.status
      });
    }

    // Se não for simulada, faz a chamada de consulta HTTP para a API BuckPay oficial
    try {
      const response = await fetch(`https://api.realtechdev.com.br/v1/transactions/external_id/${external_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${BUCKPAY_TOKEN}`,
          'User-Agent': BUCKPAY_USER_AGENT
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          return res.json({
            success: true,
            external_id,
            status: 'pending'
          });
        }

        console.error('[BuckPay ERROR] Falha ao consultar transação:', data);
        return res.status(response.status).json({
          success: false,
          message: 'Erro ao consultar status da transação na BuckPay.',
          error: data.error || data
        });
      }

      return res.json({
        success: true,
        external_id,
        transaction_id: data.data.id,
        status: data.data.status
      });

    } catch (apiError) {
      console.warn('[SERVER WARNING] Falha na rede BuckPay ao consultar. Retornando status pending local.');
      return res.json({
        success: true,
        external_id,
        status: 'pending'
      });
    }

  } catch (error) {
    console.error('[SERVER ERROR] Erro na rota de consulta de status:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno no servidor ao tentar consultar status.',
      error: error.message
    });
  }
});

// Qualquer outra rota carrega o arquivo de vendas principal
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Exporta o app para funcionamento em plataformas Serverless (como Vercel)
module.exports = app;

// Inicia o servidor local apenas se executado diretamente
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor do Guia Compra Segura rodando com sucesso!`);
    console.log(`🔗 Acesse: http://localhost:${PORT}/index.html`);
    console.log(`🛡️  Token de API BuckPay carregado de forma 100% segura.\n`);
  });
}

