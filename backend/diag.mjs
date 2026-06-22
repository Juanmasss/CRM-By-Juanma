import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const p = new PrismaClient();
try {
  const [pipelines, stages, channels, contacts, convos, messages] = await Promise.all([
    p.pipeline.count(), p.stage.count(), p.channel.count(),
    p.contact.count(), p.conversation.count(), p.message.count(),
  ]);
  console.log('counts:', { pipelines, stages, channels, contacts, convos, messages });
  const lastMsgs = await p.message.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { direction:true, senderType:true, body:true, createdAt:true } });
  console.log('ultimos mensajes:', JSON.stringify(lastMsgs));
  const waContacts = await p.contact.findMany({ where: { channel: 'whatsapp' }, select: { name:true, phone:true, channelUserId:true }, take: 10 });
  console.log('contactos whatsapp:', JSON.stringify(waContacts));
} catch (e) {
  console.error('ERROR BD:', e.message);
} finally { await p.$disconnect(); }
