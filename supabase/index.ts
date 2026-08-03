// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.14'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const NOME_CLUBE = 'Unidos por São Gens Ativo (USGA)'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function preencherTemplate(texto: string, dados: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, chave) => dados[chave] ?? match)
}

function formatarMoeda(valor: number | null): string {
  if (valor == null) return '-'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(valor)
}

function formatarData(dataISO: string | null): string {
  if (!dataISO) return '-'
  return new Date(dataISO).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
}

function obterRemetente(smtp: Record<string, string>): string {
  const email = smtp.smtp_noreply_email || smtp.smtp_from_email
  const nome = smtp.smtp_noreply_name || smtp.smtp_from_name
  return nome ? `${nome} <${email}>` : email
}

async function obterConfigSmtp(supabase: ReturnType<typeof createClient>): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name', 'smtp_noreply_email', 'smtp_noreply_name', 'associacao_email_principal'])

  if (error) {
    console.error('Erro ao ler configuracoes:', error)
  }

  const resultado = Object.fromEntries((data || []).map((c: { chave: string; valor: string }) => [c.chave, c.valor]))

  console.log('Chaves encontradas em configuracoes:', Object.keys(resultado))
  console.log('smtp_host presente:', !!resultado.smtp_host)
  console.log('smtp_user presente:', !!resultado.smtp_user)
  console.log('smtp_password presente:', !!resultado.smtp_password)
  console.log('smtp_from_email presente:', !!resultado.smtp_from_email)

  return resultado
}

function smtpConfigurado(smtp: Record<string, string>): boolean {
  return !!(smtp.smtp_host && smtp.smtp_user && smtp.smtp_password && (smtp.smtp_noreply_email || smtp.smtp_from_email))
}

async function enviarSmtp(smtp: Record<string, string>, opcoes: { to: string; subject: string; content: string; replyTo?: string }): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.smtp_host,
    port: Number(smtp.smtp_port) || 465,
    secure: smtp.smtp_secure === 'true',
    auth: {
      user: smtp.smtp_user,
      pass: smtp.smtp_password
    }
  })

  const remetente = obterRemetente(smtp)
  await transport.sendMail({
    from: remetente,
    to: opcoes.to,
    subject: opcoes.subject,
    text: opcoes.content,
    replyTo: opcoes.replyTo || remetente
  })
}

async function registarLog(supabase: ReturnType<typeof createClient>, tipo: string, destinatario: string, assunto: string, estado: 'enviado' | 'erro', erroDetalhe: string | null, inscricaoId: string | null = null): Promise<void> {
  await supabase.from('logs_email').insert({
    tipo, destinatario, assunto, estado, erro_detalhe: erroDetalhe, inscricao_id: inscricaoId
  })
}

async function processarInscricao(supabase: ReturnType<typeof createClient>, body: Record<string, string>): Promise<Response> {
  const tipo = body.tipo
  const inscricaoId = body.inscricao_id

  const { data: inscricao, error: inscricaoErr } = await supabase
    .from('inscricoes_evento')
    .select('nome, email, dorsal, eventos(titulo, data_evento, local, preco)')
    .eq('id', inscricaoId)
    .single()

  if (inscricaoErr || !inscricao) {
    await registarLog(supabase, tipo, 'desconhecido', '', 'erro', 'Inscrição não encontrada: ' + (inscricaoErr?.message || ''), inscricaoId)
    return jsonResponse({ ok: false, error: 'Inscrição não encontrada' })
  }

  const evento = inscricao.eventos as { titulo?: string; data_evento?: string; local?: string; preco?: number } | null

  const dadosTemplate: Record<string, string> = {
    nome: inscricao.nome || '',
    email: inscricao.email || '',
    evento: evento?.titulo || '',
    data_evento: formatarData(evento?.data_evento ?? null),
    local: evento?.local || '-',
    valor: formatarMoeda(evento?.preco ?? null),
    dorsal: inscricao.dorsal || '-'
  }

  const chaveAssunto = tipo === 'confirmada' ? 'template_confirmada_assunto' : 'template_pendente_assunto'
  const chaveCorpo = tipo === 'confirmada' ? 'template_confirmada_corpo' : 'template_pendente_corpo'

  const { data: configTemplates } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [chaveAssunto, chaveCorpo])

  const mapaConfig = Object.fromEntries((configTemplates || []).map((c: { chave: string; valor: string }) => [c.chave, c.valor]))
  const assuntoTemplate = mapaConfig[chaveAssunto] || `Atualização da sua inscrição - ${dadosTemplate.evento}`
  const corpoTemplate = mapaConfig[chaveCorpo] || 'Olá {{nome}}, a sua inscrição em {{evento}} foi atualizada.'

  const assunto = preencherTemplate(assuntoTemplate, dadosTemplate)
  const corpo = preencherTemplate(corpoTemplate, dadosTemplate)

  const smtp = await obterConfigSmtp(supabase)
  if (!smtpConfigurado(smtp)) {
    await registarLog(supabase, tipo, inscricao.email, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).', inscricaoId)
    return jsonResponse({ ok: false, error: 'SMTP não configurado' })
  }

  try {
    await enviarSmtp(smtp, { to: inscricao.email, subject: assunto, content: corpo })
    await registarLog(supabase, tipo, inscricao.email, assunto, 'enviado', null, inscricaoId)
    return jsonResponse({ ok: true })
  } catch (err) {
    await registarLog(supabase, tipo, inscricao.email, assunto, 'erro', String(err), inscricaoId)
    return jsonResponse({ ok: false, error: String(err) })
  }
}

async function processarSuporte(supabase: ReturnType<typeof createClient>, body: Record<string, string>): Promise<Response> {
  const mensagemId = body.mensagem_id

  const { data: mensagem, error: mensagemErr } = await supabase
    .from('mensagens_suporte')
    .select('nome, email, assunto, mensagem')
    .eq('id', mensagemId)
    .single()

  if (mensagemErr || !mensagem) {
    await registarLog(supabase, 'suporte', 'desconhecido', '', 'erro', 'Mensagem de suporte não encontrada: ' + (mensagemErr?.message || ''))
    return jsonResponse({ ok: false, error: 'Mensagem não encontrada' })
  }

  const smtp = await obterConfigSmtp(supabase)
  const destino = smtp.associacao_email_principal || 'usga.associacao@gmail.com'
  const assunto = `Novo pedido de suporte: ${mensagem.assunto}`
  const corpo = `Nome: ${mensagem.nome}\nEmail: ${mensagem.email}\n\nMensagem:\n${mensagem.mensagem}`

  if (!smtpConfigurado(smtp)) {
    await registarLog(supabase, 'suporte', destino, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).')
    return jsonResponse({ ok: false, error: 'SMTP não configurado' })
  }

  try {
    await enviarSmtp(smtp, { to: destino, subject: assunto, content: corpo, replyTo: `${mensagem.nome} <${mensagem.email}>` })
    await registarLog(supabase, 'suporte', destino, assunto, 'enviado', null)
    return jsonResponse({ ok: true })
  } catch (err) {
    await registarLog(supabase, 'suporte', destino, assunto, 'erro', String(err))
    return jsonResponse({ ok: false, error: String(err) })
  }
}

async function processarAniversario(req: Request, supabase: ReturnType<typeof createClient>, body: Record<string, string>): Promise<Response> {
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '')

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonResponse({ ok: false, error: 'Não autenticado' }, 401)
  }

  const { data: chamador } = await supabase
    .from('utilizadores')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (chamador?.role !== 'admin') {
    return jsonResponse({ ok: false, error: 'Sem permissão' }, 403)
  }

  const utilizadorId = body.utilizador_id

  const { data: membro, error: membroErr } = await supabase
    .from('utilizadores')
    .select('nome, apelido, email')
    .eq('id', utilizadorId)
    .single()

  if (membroErr || !membro?.email) {
    await registarLog(supabase, 'aniversario', 'desconhecido', '', 'erro', 'Sócio não encontrado ou sem email: ' + (membroErr?.message || ''))
    return jsonResponse({ ok: false, error: 'Sócio não encontrado ou sem email associado' })
  }

  const dadosTemplate: Record<string, string> = {
    nome: [membro.nome, membro.apelido].filter(Boolean).join(' ') || 'Sócio',
    email: membro.email,
    clube: NOME_CLUBE
  }

  const { data: configTemplates } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['template_aniversario_assunto', 'template_aniversario_corpo'])

  const mapaConfig = Object.fromEntries((configTemplates || []).map((c: { chave: string; valor: string }) => [c.chave, c.valor]))
  const assuntoTemplate = mapaConfig.template_aniversario_assunto || 'Feliz Aniversário! 🎉'
  const corpoTemplate = mapaConfig.template_aniversario_corpo || 'Olá {{nome}}, feliz aniversário da parte de {{clube}}!'

  const assunto = preencherTemplate(assuntoTemplate, dadosTemplate)
  const corpo = preencherTemplate(corpoTemplate, dadosTemplate)

  const smtp = await obterConfigSmtp(supabase)
  if (!smtpConfigurado(smtp)) {
    await registarLog(supabase, 'aniversario', membro.email, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).')
    return jsonResponse({ ok: false, error: 'SMTP não configurado. Vai a Definições → Email para o configurar.' })
  }

  try {
    await enviarSmtp(smtp, { to: membro.email, subject: assunto, content: corpo })
    await registarLog(supabase, 'aniversario', membro.email, assunto, 'enviado', null)
    return jsonResponse({ ok: true })
  } catch (err) {
    await registarLog(supabase, 'aniversario', membro.email, assunto, 'erro', String(err))
    return jsonResponse({ ok: false, error: String(err) })
  }
}

async function processarFatura(req: Request, supabase: ReturnType<typeof createClient>, body: Record<string, string>): Promise<Response> {
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '')

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonResponse({ ok: false, error: 'Não autenticado' }, 401)
  }

  const { data: chamador } = await supabase
    .from('utilizadores')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (chamador?.role !== 'admin') {
    return jsonResponse({ ok: false, error: 'Sem permissão' }, 403)
  }

  const destinatarioEmail = body.destinatario_email
  const destinatarioNome = body.destinatario_nome || 'Sócio'
  const faturaPath = body.fatura_path

  if (!destinatarioEmail || !faturaPath) {
    return jsonResponse({ ok: false, error: 'Dados em falta' }, 400)
  }

  const { data: publicUrlData } = supabase.storage.from('faturas').getPublicUrl(faturaPath)
  const linkFatura = publicUrlData?.publicUrl || ''

  const assunto = 'A sua fatura já está disponível'
  const corpo = `Olá ${destinatarioNome},\n\nA sua fatura já está disponível para download:\n${linkFatura}\n\nObrigado,\n${NOME_CLUBE}`

  const smtp = await obterConfigSmtp(supabase)
  if (!smtpConfigurado(smtp)) {
    await registarLog(supabase, 'fatura', destinatarioEmail, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).')
    return jsonResponse({ ok: false, error: 'SMTP não configurado. Vai a Definições → Email para o configurar.' })
  }

  try {
    await enviarSmtp(smtp, { to: destinatarioEmail, subject: assunto, content: corpo })
    await registarLog(supabase, 'fatura', destinatarioEmail, assunto, 'enviado', null)
    return jsonResponse({ ok: true })
  } catch (err) {
    await registarLog(supabase, 'fatura', destinatarioEmail, assunto, 'erro', String(err))
    return jsonResponse({ ok: false, error: String(err) })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Pedido inválido' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const categoria = body.categoria

  if (categoria === 'inscricao') return processarInscricao(supabase, body)
  if (categoria === 'suporte') return processarSuporte(supabase, body)
  if (categoria === 'aniversario') return processarAniversario(req, supabase, body)
  if (categoria === 'fatura') return processarFatura(req, supabase, body)

  return jsonResponse({ ok: false, error: 'Categoria desconhecida' }, 400)
})