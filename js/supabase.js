// =============================================
// USGA - Configuração Supabase
// =============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://klgfzahyvngfgxzfninp.supabase.co'
const SUPABASE_KEY = 'sb_publishable__4uHc3UFsqLKqz45B-510A_PGXY2wrs'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Autenticação ──────────────────────────────

export async function registar(nome, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } }
  })
  return { data, error }
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function logout() {
  await supabase.auth.signOut()
  window.location.href = 'index.html'
}

export async function getSessao() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getUtilizador() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

// ── Perfil ────────────────────────────────────

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('utilizadores')
    .select('*')
    .eq('id', userId)
    .single()
  return { data, error }
}

export async function atualizarPerfil(userId, dados) {
  const { data, error } = await supabase
    .from('utilizadores')
    .update(dados)
    .eq('id', userId)
  return { data, error }
}

// ── Eventos ───────────────────────────────────

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
    .order('data_evento', { ascending: false })
  return { data, error }
}

export async function getEvento(id) {
  const { data, error } = await supabase
    .from('eventos')
    .select('*')
    .eq('id', id)
    .single()
  return { data, error }
}

// ── Inscrições ────────────────────────────────

export async function inscrever(utilizadorId, eventoId) {
  const { data, error } = await supabase
    .from('inscricoes')
    .insert({ utilizador_id: utilizadorId, evento_id: eventoId })
  return { data, error }
}

export async function getMinhasInscricoes(utilizadorId) {
  const { data, error } = await supabase
    .from('inscricoes')
    .select('*, eventos(*)')
    .eq('utilizador_id', utilizadorId)
    .order('data_inscricao', { ascending: false })
  return { data, error }
}

export async function getInscricaoEvento(utilizadorId, eventoId) {
  const { data, error } = await supabase
    .from('inscricoes')
    .select('*')
    .eq('utilizador_id', utilizadorId)
    .eq('evento_id', eventoId)
    .single()
  return { data, error }
}

export async function getInscritosConfirmados(eventoId) {
  const { data, error } = await supabase
    .from('inscricoes')
    .select('utilizadores(nome, numero_socio)')
    .eq('evento_id', eventoId)
    .eq('pagamento_confirmado', true)
    .order('data_pagamento', { ascending: true })
  return { data, error }
}

// ── Quotas ────────────────────────────────────

export async function getMinhasQuotas(utilizadorId) {
  const { data, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('utilizador_id', utilizadorId)
    .order('ano', { ascending: false })
  return { data, error }
}

// ── Utilitários ───────────────────────────────

export function formatarData(dataISO) {
  if (!dataISO) return '—'
  return new Date(dataISO).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'long', year: 'numeric'
  })
}

export function requireLogin() {
  getSessao().then(sessao => {
    if (!sessao) window.location.href = 'login.html'
  })
}

export function requireAdmin() {
  getSessao().then(async sessao => {
    if (!sessao) { window.location.href = 'login.html'; return }
    const { data } = await getPerfil(sessao.user.id)
    if (!data || data.role !== 'admin') window.location.href = 'index.html'
  })
}
