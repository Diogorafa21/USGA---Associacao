// @ts-nocheck

// Edge Function: enviar-email-inscricao
//
// Chamada pelos triggers de base de dados (ver migration_email_inscricoes.sql)
// sempre que uma inscrição em evento é criada ("pendente") ou passa a
// confirmada ("confirmada"). Não é chamada diretamente pelo site.
//
// Lê as credenciais SMTP e os templates de email da tabela "configuracoes"
// (configuráveis pelo admin em admin.html → Definições → Email), substitui os
// placeholders do template pelos dados reais da inscrição, envia por SMTP, e
// regista o resultado (sucesso ou erro) em "logs_email" para diagnóstico.
//
// Nunca lança exceção não tratada -- mesmo que o SMTP não esteja configurado,
// ou o envio falhe, responde 200 com o erro registado no log, para o pg_net
// (que chamou isto de forma assíncrona/"fire-and-forget") não ficar preso.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let tipo = ''
  let inscricaoId = ''
  try {
    const body = await req.json()
    tipo = body.tipo
    inscricaoId = body.inscricao_id
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Pedido inválido' }), { status: 400 })
  }

  async function registarLog(destinatario: string, assunto: string, estado: 'enviado' | 'erro', erroDetalhe: string | null) {
    await supabase.from('logs_email').insert({
      tipo, destinatario, assunto, estado, erro_detalhe: erroDetalhe, inscricao_id: inscricaoId
    })
  }

  // 1) Dados da inscrição + evento
  const { data: inscricao, error: inscricaoErr } = await supabase
    .from('inscricoes_evento')
    .select('nome, email, dorsal, eventos(titulo, data_evento, local, preco)')
    .eq('id', inscricaoId)
    .single()

  if (inscricaoErr || !inscricao) {
    console.error('Inscrição não encontrada:', inscricaoErr)
    await registarLog('desconhecido', '', 'erro', 'Inscrição não encontrada: ' + (inscricaoErr?.message || ''))
    return new Response(JSON.stringify({ ok: false, error: 'Inscrição não encontrada' }), { status: 200 })
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

  // 2) Templates configurados pelo admin
  const chaveAssunto = tipo === 'confirmada' ? 'template_confirmada_assunto' : 'template_pendente_assunto'
  const chaveCorpo = tipo === 'confirmada' ? 'template_confirmada_corpo' : 'template_pendente_corpo'

  const { data: configTemplates } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', [chaveAssunto, chaveCorpo])

  const mapaConfig = Object.fromEntries((configTemplates || []).map(c => [c.chave, c.valor]))
  const assuntoTemplate = mapaConfig[chaveAssunto] || `Atualização da sua inscrição - ${dadosTemplate.evento}`
  const corpoTemplate = mapaConfig[chaveCorpo] || 'Olá {{nome}}, a sua inscrição em {{evento}} foi atualizada.'

  const assunto = preencherTemplate(assuntoTemplate, dadosTemplate)
  const corpo = preencherTemplate(corpoTemplate, dadosTemplate)

  // 3) Credenciais SMTP configuradas pelo admin
  const { data: configSmtp } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name'])

  const smtp = Object.fromEntries((configSmtp || []).map(c => [c.chave, c.valor]))

  if (!smtp.smtp_host || !smtp.smtp_user || !smtp.smtp_password || !smtp.smtp_from_email) {
    console.warn('SMTP não configurado -- email não enviado.')
    await registarLog(inscricao.email, assunto, 'erro', 'SMTP não configurado (falta host/utilizador/password/remetente em Definições → Email).')
    return new Response(JSON.stringify({ ok: false, error: 'SMTP não configurado' }), { status: 200 })
  }

  // 4) Envio por SMTP
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
      to: inscricao.email,
      subject: assunto,
      content: corpo
    })

    await client.close()
    await registarLog(inscricao.email, assunto, 'enviado', null)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error('Erro ao enviar email via SMTP:', err)
    await registarLog(inscricao.email, assunto, 'erro', String(err))
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 200 })
  }
})