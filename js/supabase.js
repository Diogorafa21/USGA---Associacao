// USGA - cliente Supabase e funcoes de dados.
// Este ficheiro deve ser importado em scripts type="module".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://klgfzahyvngfgxzfninp.supabase.co'
const SUPABASE_KEY = 'sb_publishable__4uHc3UFsqLKqz45B-510A_PGXY2wrs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Autenticacao ---------------------------------------------------------------

export async function registar(nome, apelido, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome, apelido } }
  })
  return { data, error }
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function logout(redirectTo = 'index.html') {
  await supabase.auth.signOut()
  window.location.href = redirectTo
}

export async function getSessao() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUtilizador() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

// Perfil e socios ------------------------------------------------------------

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('utilizadores')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

// Agora inclui p_nif (corrigido)
export async function atualizarPerfil(userId, dados) {
  const { data, error } = await supabase.rpc('atualizar_meu_perfil', {
    p_nome:            dados.nome            ?? null,
    p_apelido:         dados.apelido         ?? null,
    p_telefone:        dados.telefone        ?? null,
    p_data_nascimento: dados.data_nascimento ?? null,
    p_cidade:          dados.cidade          ?? null,
    p_pais:            dados.pais            ?? null,
    p_foto_url:        dados.foto_url        ?? null,
    p_nif:             dados.nif             ?? null
  })
  return { data, error }
}

export async function criarPedidoSocio(dados) {
  const sessao = await getSessao()
  const payload = { ...dados, utilizador_id: sessao?.user?.id ?? null }
  const { data, error } = await supabase
    .from('pedidos_socio')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

// Quotas ---------------------------------------------------------------------

export async function getMinhasQuotas(utilizadorId) {
  const { data, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('utilizador_id', utilizadorId)
    .order('ano', { ascending: false })
  return { data, error }
}

// Eventos --------------------------------------------------------------------

export async function getEventosFuturos() {
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .gte('data_evento', new Date().toISOString())
    .in('estado', ['aberto', 'fechado'])
    .order('data_evento', { ascending: true })
  return { data, error }
}

export async function getEventosPassados() {
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .lt('data_evento', new Date().toISOString())
    .eq('estado', 'concluido')
    .order('data_evento', { ascending: false })
  return { data, error }
}

export async function getEvento(idOuSlug) {
  const coluna = pareceUuid(idOuSlug) ? 'id' : 'slug'
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .eq(coluna, idOuSlug)
    .single()
  return { data, error }
}

// Inscricoes -----------------------------------------------------------------

// Usa o novo RPC que cria inscrição + pagamento numa só operação
export async function criarInscricaoEvento(dados) {
  const { data, error } = await supabase.rpc('criar_inscricao_com_pagamento', {
    p_evento_id:       dados.evento_id,
    p_nome:            dados.nome,
    p_email:           dados.email,
    p_telefone:        dados.telefone        ?? null,
    p_nif:             dados.nif             ?? null,
    p_bi:              dados.bi              ?? null,
    p_data_nascimento: dados.data_nascimento ?? null,
    p_sexo:            dados.sexo            ?? null,
    p_pais:            dados.pais            ?? 'Portugal',
    p_equipa:          dados.equipa          ?? null
  })
  return { data, error }
}

export async function getMinhasInscricoes(utilizadorId) {
  const { data, error } = await supabase
    .from('inscricoes_evento')
    .select('*, eventos(*)')
    .eq('utilizador_id', utilizadorId)
    .order('data_inscricao', { ascending: false })
  return { data, error }
}

export async function getInscricaoEvento(utilizadorId, eventoId) {
  const { data, error } = await supabase
    .from('inscricoes_evento')
    .select('*')
    .eq('utilizador_id', utilizadorId)
    .eq('evento_id', eventoId)
    .maybeSingle()
  return { data, error }
}

export async function getInscritosConfirmados(eventoId) {
  const { data, error } = await supabase
    .from('inscritos_publicos')
    .select('nome, pais, equipa, dorsal, data_confirmacao')
    .eq('evento_id', eventoId)
    .order('data_confirmacao', { ascending: true })
  return { data, error }
}

export async function getEstadoInscricao(publicToken) {
  const { data, error } = await supabase
    .rpc('get_estado_inscricao', { token: publicToken })
    .maybeSingle()
  return { data, error }
}

// Pagamentos -----------------------------------------------------------------

export async function criarPagamento(dados) {
  const sessao = await getSessao()
  const payload = { ...dados, utilizador_id: dados.utilizador_id ?? sessao?.user?.id ?? null }
  const { data, error } = await supabase
    .from('pagamentos')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

// Usa o RPC transacional (corrigido)
export async function validarPagamento(pagamentoId, dorsal = null, observacoes = null) {
  const { data, error } = await supabase.rpc('validar_pagamento', {
    p_pagamento_id: pagamentoId,
    p_dorsal:       dorsal,
    p_observacoes:  observacoes
  })
  return { data, error }
}

export async function rejeitarPagamento(pagamentoId, motivo = null) {
  const { data, error } = await supabase.rpc('rejeitar_pagamento', {
    p_pagamento_id: pagamentoId,
    p_motivo:       motivo
  })
  return { data, error }
}

// Suporte --------------------------------------------------------------------

export async function criarMensagemSuporte(dados) {
  const sessao = await getSessao()
  const payload = { ...dados, utilizador_id: sessao?.user?.id ?? null }
  const { data, error } = await supabase
    .from('mensagens_suporte')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

// Back-office ----------------------------------------------------------------

export async function getAdminPedidosSocio() {
  const { data, error } = await supabase
    .from('pedidos_socio')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function atualizarPedidoSocio(id, dados) {
  const { data, error } = await supabase
    .from('pedidos_socio')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function getAdminInscricoesEvento() {
  const { data, error } = await supabase
    .from('inscricoes_evento')
    .select('*, eventos(titulo, data_evento)')
    .order('data_inscricao', { ascending: false })
  return { data, error }
}

export async function atualizarInscricaoEvento(id, dados) {
  const { data, error } = await supabase
    .from('inscricoes_evento')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function getAdminQuotas() {
  const { data, error } = await supabase
    .from('quotas')
    .select('*, utilizadores(nome, apelido, email, numero_socio)')
    .order('ano', { ascending: false })
  return { data, error }
}

export async function atualizarQuota(id, dados) {
  const { data, error } = await supabase
    .from('quotas')
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function getAdminPagamentos() {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*, utilizadores(nome, apelido, email), inscricoes_evento(nome, evento_id, eventos(titulo)), quotas(ano, utilizadores(nome, apelido))')
    .order('created_at', { ascending: false })
  return { data, error }
}

// Guardas --------------------------------------------------------------------

export async function requireLogin() {
  const sessao = await getSessao()
  if (!sessao) {
    window.location.href = 'login.html'
    return null
  }
  return sessao
}

export async function requireAdmin() {
  const sessao = await requireLogin()
  if (!sessao) return null
  const { data } = await getPerfil(sessao.user.id)
  if (!data || data.role !== 'admin') {
    window.location.href = 'index.html'
    return null
  }
  return { sessao, perfil: data }
}

// Utilitarios ----------------------------------------------------------------

export function formatarData(dataISO) {
  if (!dataISO) return '-'
  return new Date(dataISO).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(Number(valor || 0))
}

function pareceUuid(valor) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)
}
