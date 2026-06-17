import { ChannelType, CustomFieldEntity, CustomFieldType, PrismaClient, StageType } from "@prisma/client";

const prisma = new PrismaClient();

// IDs deterministas para que el seed sea idempotente (re-ejecutable sin duplicar).
const PIPELINE_ID = "00000000-0000-0000-0000-0000000000p1";
const STAGE = {
  incoming: "00000000-0000-0000-0000-0000000000s1",
  nuevo: "00000000-0000-0000-0000-0000000000s2",
  clasificado: "00000000-0000-0000-0000-0000000000s3",
  interes: "00000000-0000-0000-0000-0000000000s4",
  tallaColor: "00000000-0000-0000-0000-0000000000s5",
  link: "00000000-0000-0000-0000-0000000000s6",
  checkout: "00000000-0000-0000-0000-0000000000s7",
  pago: "00000000-0000-0000-0000-0000000000s8",
  recibido: "00000000-0000-0000-0000-0000000000s9",
  sinContacto: "00000000-0000-0000-0000-0000000000sa",
};
const CHANNEL = {
  whatsapp: "00000000-0000-0000-0000-0000000000c1",
  instagram: "00000000-0000-0000-0000-0000000000c2",
  facebook: "00000000-0000-0000-0000-0000000000c3",
  tiktok: "00000000-0000-0000-0000-0000000000c4",
};
const USER_ID = "00000000-0000-0000-0000-0000000000u1";

async function main() {
  // ── Usuario agente ────────────────────────────────────────
  const agent = await prisma.user.upsert({
    where: { email: "asesor1@crmbyjuanma.local" },
    update: { name: "Asesor 1" },
    create: { id: USER_ID, name: "Asesor 1", email: "asesor1@crmbyjuanma.local", role: "agent" },
  });

  // ── Pipeline + etapas ─────────────────────────────────────
  await prisma.pipeline.upsert({
    where: { id: PIPELINE_ID },
    update: { name: "Embudo de ventas", position: 0 },
    create: { id: PIPELINE_ID, name: "Embudo de ventas", position: 0 },
  });

  const stages: { id: string; name: string; type: StageType; color: string }[] = [
    { id: STAGE.incoming, name: "Leads entrantes", type: "incoming", color: "#8b5cf6" },
    { id: STAGE.nuevo, name: "Nuevo lead", type: "normal", color: "#a78bfa" },
    { id: STAGE.clasificado, name: "Clasificado", type: "normal", color: "#7c3aed" },
    { id: STAGE.interes, name: "Producto de interés", type: "normal", color: "#6d28d9" },
    { id: STAGE.tallaColor, name: "Validar talla/color", type: "normal", color: "#5b21b6" },
    { id: STAGE.link, name: "Link enviado", type: "normal", color: "#4c1d95" },
    { id: STAGE.checkout, name: "Checkout iniciado", type: "normal", color: "#9333ea" },
    { id: STAGE.pago, name: "Pago pendiente", type: "normal", color: "#c026d3" },
    { id: STAGE.recibido, name: "Pedido recibido", type: "won", color: "#16a34a" },
    { id: STAGE.sinContacto, name: "Sin contacto", type: "lost", color: "#dc2626" },
  ];

  for (const [position, s] of stages.entries()) {
    await prisma.stage.upsert({
      where: { id: s.id },
      update: { name: s.name, type: s.type, color: s.color, position, pipelineId: PIPELINE_ID },
      create: { id: s.id, pipelineId: PIPELINE_ID, name: s.name, type: s.type, color: s.color, position },
    });
  }

  // ── Custom fields de lead ─────────────────────────────────
  const customFields: {
    code: string;
    label: string;
    type: CustomFieldType;
    options?: string[];
  }[] = [
    { code: "producto", label: "Producto", type: "text" },
    { code: "talla", label: "Talla", type: "select", options: ["XS", "S", "M", "L", "XL", "XXL"] },
    { code: "cantidad", label: "Cantidad", type: "number" },
    { code: "ciudad", label: "Ciudad", type: "text" },
    {
      code: "linea_producto",
      label: "Línea de producto",
      type: "select",
      options: ["Ropa", "Calzado", "Accesorios", "Tecnología", "Hogar"],
    },
    {
      code: "intencion",
      label: "Intención de compra",
      type: "select",
      options: ["Alta", "Media", "Baja"],
    },
    {
      code: "fuente",
      label: "Fuente",
      type: "select",
      options: ["WhatsApp", "Instagram", "Facebook", "TikTok", "Orgánico", "Pauta"],
    },
    {
      code: "metodo_pago",
      label: "Método de pago",
      type: "select",
      options: ["Contraentrega", "Transferencia", "Tarjeta", "Nequi", "Daviplata"],
    },
    { code: "direccion_entrega", label: "Dirección de entrega", type: "text" },
  ];

  for (const [position, f] of customFields.entries()) {
    await prisma.customFieldDefinition.upsert({
      where: { entity_code: { entity: CustomFieldEntity.lead, code: f.code } },
      update: { label: f.label, type: f.type, options: f.options ?? undefined, position },
      create: {
        entity: CustomFieldEntity.lead,
        code: f.code,
        label: f.label,
        type: f.type,
        options: f.options ?? undefined,
        position,
      },
    });
  }

  // ── Canales ───────────────────────────────────────────────
  const channels: { id: string; type: ChannelType; name: string; isActive: boolean }[] = [
    { id: CHANNEL.whatsapp, type: "whatsapp", name: "WhatsApp", isActive: true },
    { id: CHANNEL.instagram, type: "instagram", name: "Instagram", isActive: false },
    { id: CHANNEL.facebook, type: "facebook", name: "Facebook", isActive: false },
    { id: CHANNEL.tiktok, type: "tiktok", name: "TikTok", isActive: false },
  ];
  for (const c of channels) {
    await prisma.channel.upsert({
      where: { id: c.id },
      update: { name: c.name, isActive: c.isActive, type: c.type },
      create: c,
    });
  }

  // ── Leads de ejemplo + contactos ──────────────────────────
  const sampleLeads: {
    id: string;
    contactId: string;
    contactName: string;
    phone: string;
    stageId: string;
    value: number;
    source: string;
  }[] = [
    {
      id: "00000000-0000-0000-0000-0000000000l1",
      contactId: "00000000-0000-0000-0000-0000000000k1",
      contactName: "Laura Gómez",
      phone: "+573001112233",
      stageId: STAGE.incoming,
      value: 120000,
      source: "whatsapp",
    },
    {
      id: "00000000-0000-0000-0000-0000000000l2",
      contactId: "00000000-0000-0000-0000-0000000000k2",
      contactName: "Carlos Rodríguez",
      phone: "+573004445566",
      stageId: STAGE.clasificado,
      value: 89000,
      source: "instagram",
    },
    {
      id: "00000000-0000-0000-0000-0000000000l3",
      contactId: "00000000-0000-0000-0000-0000000000k3",
      contactName: "Mariana López",
      phone: "+573007778899",
      stageId: STAGE.tallaColor,
      value: 159000,
      source: "whatsapp",
    },
    {
      id: "00000000-0000-0000-0000-0000000000l4",
      contactId: "00000000-0000-0000-0000-0000000000k4",
      contactName: "Andrés Pérez",
      phone: "+573002223344",
      stageId: STAGE.pago,
      value: 210000,
      source: "facebook",
    },
    {
      id: "00000000-0000-0000-0000-0000000000l5",
      contactId: "00000000-0000-0000-0000-0000000000k5",
      contactName: "Valentina Ruiz",
      phone: "+573009990011",
      stageId: STAGE.recibido,
      value: 99000,
      source: "tiktok",
    },
  ];

  for (const l of sampleLeads) {
    await prisma.contact.upsert({
      where: { id: l.contactId },
      update: { name: l.contactName, phone: l.phone },
      create: {
        id: l.contactId,
        name: l.contactName,
        phone: l.phone,
        channel: ChannelType.whatsapp,
        channelUserId: l.phone.replace("+", ""),
      },
    });

    await prisma.lead.upsert({
      where: { id: l.id },
      update: { stageId: l.stageId, value: l.value },
      create: {
        id: l.id,
        name: l.contactName,
        pipelineId: PIPELINE_ID,
        stageId: l.stageId,
        contactId: l.contactId,
        responsibleUserId: agent.id,
        value: l.value,
        status: l.stageId === STAGE.recibido ? "won" : "open",
        source: l.source,
        closedAt: l.stageId === STAGE.recibido ? new Date() : null,
      },
    });
  }

  console.log("✅ Seed completado: 1 usuario, 1 pipeline (10 etapas), 9 custom fields, 4 canales, 5 leads.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
