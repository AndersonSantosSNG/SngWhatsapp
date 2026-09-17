const Message = require('../../models/Message');

function createChatEventService({ getIo }) {
  async function recordChatEvent(chat, agent, action) {
    const actionLabels = {
      claimed: 'assumiu o atendimento',
      unclaimed: 'devolveu o atendimento',
      closed: 'encerrou o atendimento',
    };
    if (!chat || !agent || !actionLabels[action]) throw new Error('Evento interno invalido.');

    const savedEvent = await Message.create({
      ticketId: chat._id,
      phoneNumber: chat.phoneNumber,
      sender: 'agent',
      isInternalEvent: true,
      internalAction: action,
      internalActorName: agent.name,
      body: `${agent.name} ${actionLabels[action]}`,
      timestamp: new Date(),
    });
    const eventData = {
      id: savedEvent._id.toString(),
      ticketId: chat._id.toString(),
      chat: typeof chat.toObject === 'function' ? chat.toObject() : chat,
      sender: 'agent',
      body: savedEvent.body,
      isInternalEvent: true,
      internalAction: action,
      internalActorName: agent.name,
      timestamp: savedEvent.timestamp,
      fromMe: true,
    };
    getIo()?.emit('chat_event', eventData);
    return eventData;
  }

  async function recordGlpiTicketEvent(chat, agent, glpiTicketId, glpiTicketUrl) {
    if (!chat || !agent || !glpiTicketId) throw new Error('Dados do chamado GLPI inválidos.');
    const body = `${agent.name} abriu um chamado ${glpiTicketId}`;
    const savedEvent = await Message.create({
      ticketId: chat._id,
      phoneNumber: chat.phoneNumber,
      sender: 'agent',
      isInternalEvent: true,
      internalAction: 'glpi_created',
      internalActorName: agent.name,
      glpiTicketId: String(glpiTicketId),
      glpiTicketUrl,
      body,
      timestamp: new Date(),
    });
    const eventData = {
      id: savedEvent._id.toString(),
      ticketId: chat._id.toString(),
      chat: typeof chat.toObject === 'function' ? chat.toObject() : chat,
      sender: 'agent',
      body,
      isInternalEvent: true,
      internalAction: 'glpi_created',
      internalActorName: agent.name,
      glpiTicketId: String(glpiTicketId),
      glpiTicketUrl,
      timestamp: savedEvent.timestamp,
      fromMe: true,
    };
    getIo()?.emit('chat_event', eventData);
    return eventData;
  }

  return { recordChatEvent, recordGlpiTicketEvent };
}

module.exports = { createChatEventService };
