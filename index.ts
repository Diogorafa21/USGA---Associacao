// @ts-nocheck
// Edge Function: enviar-email-aniversario
//
// Chamada diretamente pelo botão "🎉 Aniversário" na secção Sócios do
// back-office (admin.html), via supabase.functions.invoke(...). Ao contrário
// de enviar-email-inscricao (disparada automaticamente por triggers, servidor
// a servidor), esta é chamada diretamente pelo browser -- por isso, e só por
// isso, precisa de responder a pedidos CORS (incluindo o preflight OPTIONS
// que o browser envia antes do pedido real). Sem isto, o browser bloqueia o
// pedido antes sequer de chegar à função, e o supabase-js reporta o erro
// genérico "Failed to send a request to the Edge Function".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

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

Deno.serve(async (req) => {
  // O browser envia sempre um pedido OPTIONS de "preflight" antes do POST
  // real, para perguntar se este origin/headers são permitidos.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace('Bearer ', '')

  // 1) confirma que quem chama tem sessão válida
  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonResponse({ ok: false, error: 'Não autenticado' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 2) confirma que é admin
  const { data: chamador } = await supabase
    .from('utilizadores')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (chamador?.role !== 'admin') {
    return jsonResponse({ ok: false, error: 'Sem permissão' }, 403)
  }

  // 3) lê o sócio alvo
  let utilizadorId = ''
  try {
    const body = await req.json()
    utilizadorId = body.utilizador_id
  } catch {
    return jsonResponse({ ok: false, error: 'Pedido inválido' }, 400)
  }

  async function registarLog(destinatario: string, assunto: string, estado: 'enviado' | 'erro', erroDetalhe: string | null) {
    await supabase.from('logs_email').insert({
      tipo: 'aniversario', destinatario, assunto, estado, erro_detalhe: erroDetalhe
    })
  }

  const { data: membro, error: membroErr } = await supabase
    .from('utilizadores')
    .select('nome, apelido, email')
    .eq('id', utilizadorId)
    .single()

  if (membroErr || !membro?.email) {
    await registarLog('desconhecido', '', 'erro', 'Sócio não encontrado ou sem email: ' + (membroErr?.message || ''))
    return jsonResponse({ ok: false, error: 'Sócio não encontrado ou sem email associado' })
  }

  const dadosTemplate: Record<string, string> = {
    nome: [membro.nome, membro.apelido].filter(Boolean).join(' ') || 'Sócio',
    email: membro.email,
    clube: NOME_CLUBE
  }

  // 4) templates configurados pelo admin
  const { data: configTemplates } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['template_aniversario_assunto', 'template_aniversario_corpo'])

  const mapaConfig = Object.fromEntries((configTemplates || []).map(c => [c.chave, c.valor]))
  const assuntoTemplate = mapaConfig.template_aniversario_assunto || 'Feliz Aniversário! 🎉'
  const corpoTemplate = mapaConfig.template_aniversario_corpo || 'Olá {{nome}}, feliz aniversário da parte de {{clube}}!'

  const assunto = preencherTemplate(assuntoTemplate, dadosTemplate)
  const corpo = preencherTemplate(corpoTemplate, dadosTemplate)

  // 5) credenciais SMTP configuradas pelo admin
  const { data: configSmtp } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name'])

  const smtp = Object.fromEntries((configSmtp || []).map(c => [c.chave, c.valor]))

  if (!smtp.smtp_host || !smtp.smtp_user || !smtp.smtp_password || !smtp.smtp_from_email) {
    await registarLog(membro.email, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).')
    return jsonResponse({ ok: false, error: 'SMTP não configurado. Vai a Definições → Email para o configurar.' })
  }

  // 6) envio por SMTP
  try {
    const client = new SMTPClient({
      connection: {
        hostname: smtp.smtp_host,
        port: Number(smtp.smtp_port) || 587,
        tls: smtp.smtp_secure === 'true',
        auth: {
          username: smtp.smtp_user,
          password: smtp.smtp_password
        }
      }
    })

    await client.send({
      from: smtp.smtp_from_name ? `${smtp.smtp_from_name} <${smtp.smtp_from_email}>` : smtp.smtp_from_email,
      to: membro.email,
      subject: assunto,
      content: corpo
    })

    await client.close()
    await registarLog(membro.email, assunto, 'enviado', null)
    return jsonResponse({ ok: true })
  } catch (err) {
    console.error('Erro ao enviar email de aniversário via SMTP:', err)
    await registarLog(membro.email, assunto, 'erro', String(err))
    return jsonResponse({ ok: false, error: String(err) })
  }
})