const messageQueue = [];
let isProcessingQueue = false;

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    
    isProcessingQueue = true;
    const task = messageQueue.shift();

    try {
        await task();
    } catch (err) {
        console.error('Erro na execução da fila de envio:', err);
    } finally {
        setTimeout(() => {
            isProcessingQueue = false;
            processQueue();
        }, 2000);
    }
}

function addToQueue(taskFn) {
    return new Promise((resolve, reject) => {
        messageQueue.push(async () => {
            try {
                const result = await taskFn();
                resolve(result);
            } catch (err) {
                reject(err);
            }
        });
        processQueue();
    });
}

module.exports = { addToQueue };