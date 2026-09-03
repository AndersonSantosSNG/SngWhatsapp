const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
        return res.status(401).json({ error: 'Acesso não autorizado. Chave de API ausente ou inválida.' });
    }
    next();
};

module.exports = checkApiKey;