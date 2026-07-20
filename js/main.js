document.addEventListener('DOMContentLoaded', async function () {
  // ── Navbar Mobile (Hamburguer) ─────────────────────────────────
  const navToggle = document.createElement('button')
  navToggle.className = 'nav-toggle'
  navToggle.setAttribute('aria-label', 'Abrir menu')
  navToggle.innerHTML = '<span></span><span></span><span></span>'

  const navOverlay = document.createElement('div')
  navOverlay.className = 'nav-overlay'

  const nav = document.querySelector('.nav')
  const headerContainer = document.querySelector('.header-container')

  if (nav && headerContainer) {
    // Inserir botão antes do botão de login
    const loginBtn = headerContainer.querySelector('.btn-primary')
    headerContainer.insertBefore(navToggle, loginBtn)
    document.body.appendChild(navOverlay)

    function abrirMenu() {
      nav.classList.add('open')
      navToggle.classList.add('open')
      navOverlay.classList.add('open')
      navToggle.setAttribute('aria-label', 'Fechar menu')
      document.body.style.overflow = 'hidden'
    }

    function fecharMenu() {
      nav.classList.remove('open')
      navToggle.classList.remove('open')
      navOverlay.classList.remove('open')
      navToggle.setAttribute('aria-label', 'Abrir menu')
      document.body.style.overflow = ''
    }

    navToggle.addEventListener('click', () => {
      nav.classList.contains('open') ? fecharMenu() : abrirMenu()
    })

    navOverlay.addEventListener('click', fecharMenu)

    // Fechar ao clicar num link do menu e garantir navegação em mobile
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', function (e) {
        // Fecha o menu imediatamente para feedback visual
        fecharMenu()
        const href = this.getAttribute('href')
        const target = this.getAttribute('target')
        // Se for anchor interno ou abrir em nova aba, deixar o comportamento padrão
        if (!href || href.startsWith('#') || target === '_blank') return
        // Prevenir navegação imediata para permitir animação de fecho no mobile
        e.preventDefault()
        setTimeout(() => { window.location.href = href }, 220)
      })
    })

    // Fechar com ESC e ao redimensionar/orientacao (melhora UX mobile)
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharMenu() })
    window.addEventListener('resize', () => { if (window.innerWidth > 768 && nav.classList.contains('open')) fecharMenu() })
    window.addEventListener('orientationchange', fecharMenu)
  }
  // ────────────────────────────────────────────────────────────────


  let api = null

  try {
    api = await import('./supabase.js')
  } catch (error) {
    console.error('Nao foi possivel carregar o Supabase.', error)
  }

  const sessao = api ? await api.getSessao() : null
  const loginBtn = document.querySelector('header .btn-primary')

  if (loginBtn && sessao) {
    loginBtn.textContent = 'O meu Perfil'
    loginBtn.href = 'perfil.html'
    loginBtn.style.backgroundColor = '#333'
  }

  if (isPagina('perfil.html') && api && !sessao) {
    window.location.href = 'login.html'
    return
  }

  configurarLogin(api)
  configurarRegisto(api)
  configurarPedidoSocio(api)
  configurarPerfil(api, sessao)
  configurarInscricaoEvento(api)
  configurarEventoPublico(api)
  configurarPagamentoEvento()
  configurarEstadoInscricao(api)
  configurarAdmin(api)
  configurarLogout(api)
  configurarPreviewFoto()
})

function configurarLogin(api) {
  const loginForm = document.querySelector('#loginForm')
  if (!loginForm || !api) return

  mostrarMensagemQuery(loginForm)

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault()

    const email = loginForm.email.value.trim()
    const password = loginForm.password.value
    const submitBtn = loginForm.querySelector('button[type="submit"]')

    if (!email.includes('@')) {
      mostrarMensagem(loginForm, 'Para ja, entre com o email associado a sua conta.', 'erro')
      return
    }

    bloquearBotao(submitBtn, true, 'A entrar...')

    const { error } = await api.login(email, password)

    bloquearBotao(submitBtn, false, 'Entrar')

    if (error) {
      mostrarMensagem(loginForm, traduzirErroAuth(error.message), 'erro')
      return
    }

    window.location.href = 'perfil.html'
  })
}

function configurarRegisto(api) {
  const registerForm = document.querySelector('#registerForm')
  if (!registerForm || !api) return

  registerForm.addEventListener('submit', async function (event) {
    event.preventDefault()

    const nome = registerForm.nome.value.trim()
    const apelido = registerForm.apelido.value.trim()
    const email = registerForm.email.value.trim()
    const password = registerForm.pass.value
    const confirmPassword = registerForm['confirm-pass'].value
    const submitBtn = registerForm.querySelector('button[type="submit"]')

    if (password !== confirmPassword) {
      mostrarMensagem(registerForm, 'As passwords nao coincidem.', 'erro')
      return
    }

    if (password.length < 6) {
      mostrarMensagem(registerForm, 'A password deve ter pelo menos 6 caracteres.', 'erro')
      return
    }

    bloquearBotao(submitBtn, true, 'A criar conta...')

    const { error } = await api.registar(nome, apelido, email, password)

    bloquearBotao(submitBtn, false, 'Criar Conta')

    if (error) {
      mostrarMensagem(registerForm, traduzirErroAuth(error.message), 'erro')
      return
    }

    window.location.href = 'login.html?registo=sucesso'
  })
}

function configurarPedidoSocio(api) {
  if (!isPagina('registo-socio.html') || !api) return

  const form = document.querySelector('form[action="pagamento-quota.html"]')
  if (!form) return

  form.addEventListener('submit', async function (event) {
    event.preventDefault()

    const submitBtn = form.querySelector('button[type="submit"]')
    bloquearBotao(submitBtn, true, 'A guardar pedido...')

    const dados = {
      nome: form.nome.value.trim(),
      apelido: form.apelido.value.trim(),
      data_nascimento: form.nascimento.value || null,
      cidade: form.cidade.value.trim(),
      cc: form.cc.value.trim(),
      nif: form.nif.value.trim(),
      telefone: form.telefone.value.trim(),
      email: form.email.value.trim()
    }

    const { data, error } = await api.criarPedidoSocio(dados)

    bloquearBotao(submitBtn, false, 'Tornar-me Socio')

    if (error) {
      mostrarMensagem(form, 'Nao foi possivel guardar o pedido. Confirme os dados e tente novamente.', 'erro')
      return
    }

    sessionStorage.setItem('usga_pedido_socio_id', data.id)
    window.location.href = `pagamento-quota.html?pedido=${encodeURIComponent(data.id)}`
  })
}

async function configurarPerfil(api, sessao) {
  if (!isPagina('perfil.html') || !api || !sessao) return

  const { data: perfil, error } = await api.getPerfil(sessao.user.id)
  if (error || !perfil) return

  const nomeCompleto = [perfil.nome, perfil.apelido].filter(Boolean).join(' ')
  const primeiroNome = perfil.nome || 'Socio'

  const heroTitle = document.querySelector('.hero-content h1')
  const profileName = document.querySelector('.profile-name')
  const profileType = document.querySelector('.profile-type')
  const formInputs = document.querySelectorAll('.content-box form input')

  if (heroTitle) heroTitle.textContent = `Ola, ${primeiroNome}`
  if (profileName) profileName.textContent = nomeCompleto || perfil.email
  if (profileType) {
    profileType.textContent = perfil.numero_socio
      ? `Socio n. ${perfil.numero_socio}`
      : 'Conta registada'
  }

  if (formInputs.length >= 4) {
    formInputs[0].value = nomeCompleto
    formInputs[1].value = perfil.email || ''
    formInputs[2].value = perfil.telefone || ''
    formInputs[3].value = perfil.nif || ''
  }

  if (perfil.role === 'admin') adicionarLinkAdminPerfil()

  await carregarQuotasPerfil(api, sessao.user.id)
}

async function carregarQuotasPerfil(api, utilizadorId) {
  const quotaBox = Array.from(document.querySelectorAll('.content-box'))
    .find(box => box.textContent.includes('Estado das Quotas'))
  const tbody = quotaBox?.querySelector('tbody')
  const badgeEstado = quotaBox?.querySelector('.box-header .badge')

  if (!tbody) return

  const { data: quotas, error } = await api.getMinhasQuotas(utilizadorId)

  if (error) {
    tbody.innerHTML = '<tr><td colspan="5">Nao foi possivel carregar as quotas.</td></tr>'
    return
  }

  if (!quotas || quotas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Ainda nao existem quotas registadas.</td></tr>'
    if (badgeEstado) {
      badgeEstado.textContent = 'Sem quotas'
      badgeEstado.className = 'badge badge-pendente'
    }
    return
  }

  const temQuotaPendente = quotas.some(quota => ['por_pagar', 'pendente_validacao'].includes(quota.estado))

  if (badgeEstado) {
    badgeEstado.textContent = temQuotaPendente ? 'Quota pendente' : 'Socio Ativo'
    badgeEstado.className = temQuotaPendente ? 'badge badge-pendente' : 'badge badge-socio'
  }

  tbody.innerHTML = quotas.map(quota => {
    const pago = quota.estado === 'pago' || quota.estado === 'isento'
    const estadoLabel = estadoQuotaLabel(quota.estado)
    const fatura = quota.fatura_url
      ? `<a href="${quota.fatura_url}" style="color: var(--accent-color);">Download</a>`
      : quota.associados_app_url
        ? `<a href="${quota.associados_app_url}" style="color: var(--accent-color);">Abrir</a>`
        : '-'

    return `
      <tr>
        <td><strong>${quota.ano}</strong></td>
        <td>${api.formatarMoeda(quota.valor)}</td>
        <td>${quota.data_pagamento ? api.formatarData(quota.data_pagamento) : '-'}</td>
        <td><span class="badge ${pago ? 'badge-pago' : 'badge-pendente'}">${estadoLabel}</span></td>
        <td>${fatura}</td>
      </tr>
    `
  }).join('')
}

async function configurarInscricaoEvento(api) {
  if (!isPagina('inscricao-evento.html') || !api) return

  const form = document.querySelector('form[action="pagamento-evento.html"]')
  if (!form) return

  const evento = await carregarEventoAtual(api)
  const tituloEvento = document.querySelector('.contact-form p')

  if (evento && tituloEvento) {
    tituloEvento.textContent = evento.titulo
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault()

    if (!evento) {
      mostrarMensagem(form, 'Este evento ainda nao esta disponivel para inscricoes online.', 'erro')
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    bloquearBotao(submitBtn, true, 'A guardar inscricao...')

    const dados = {
      evento_id: evento.id,
      nome: form.nome.value.trim(),
      data_nascimento: form.nascimento.value || null,
      sexo: form.sexo.value,
      pais: form.pais.value.trim(),
      equipa: form.equipa.value.trim() || null,
      telefone: form.telefone.value.trim(),
      email: form.email.value.trim(),
      bi: form.bi.value.trim(),
      nif: form.nif.value.trim()
    }

    const { data, error } = await api.criarInscricaoEvento(dados)

    bloquearBotao(submitBtn, false, 'Seguir para Pagamento')

    if (error) {
      mostrarMensagem(form, 'Nao foi possivel guardar a inscricao. Verifique se este email ja esta inscrito.', 'erro')
      return
    }

    sessionStorage.setItem('usga_inscricao_evento_id', data.id)
    sessionStorage.setItem('usga_inscricao_evento_token', data.public_token)

    const params = new URLSearchParams({
      inscricao: data.id,
      token: data.public_token
    })

    window.location.href = `pagamento-evento.html?${params.toString()}`
  })
}

async function configurarEventoPublico(api) {
  if (!isPagina('evento-futuro.html') || !api) return

  const evento = await carregarEventoAtual(api)
  adicionarLinkEstadoEvento()
  atualizarLinkInscricaoEvento()

  if (!evento) return

  const { data: inscritos, error } = await api.getInscritosConfirmados(evento.id)
  const tbody = document.querySelector('#participantsTable tbody')
  const stats = document.querySelectorAll('.stat-number')

  if (!tbody) return

  if (error) {
    tbody.innerHTML = '<tr><td colspan="4">Nao foi possivel carregar a lista de inscritos.</td></tr>'
    return
  }

  if (!inscritos || inscritos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Ainda nao existem inscricoes confirmadas.</td></tr>'
  } else {
    tbody.innerHTML = inscritos.map((inscrito, index) => `
      <tr>
        <td style="font-weight:bold; color: #666;">${abreviarPais(inscrito.pais)}</td>
        <td>${inscrito.nome}</td>
        <td><strong>${inscrito.dorsal || String(index + 1).padStart(3, '0')}</strong></td>
        <td><span class="badge badge-pago">Confirmado</span></td>
      </tr>
    `).join('')
  }

  if (stats.length >= 3) {
    stats[0].textContent = inscritos?.length || 0
    stats[1].textContent = inscritos?.length || 0
    stats[2].textContent = '-'
  }
}

function configurarPagamentoEvento() {
  if (!isPagina('pagamento-evento.html')) return

  const token = new URLSearchParams(window.location.search).get('token') ||
    sessionStorage.getItem('usga_inscricao_evento_token')

  if (!token) return

  const voltarBtn = document.querySelector('.contact-section .btn.btn-primary')
  if (!voltarBtn) return

  const estadoLink = document.createElement('a')
  estadoLink.href = `estado-inscricao.html?token=${encodeURIComponent(token)}`
  estadoLink.className = 'btn-outline'
  estadoLink.style.marginTop = '15px'
  estadoLink.textContent = 'Ver estado da inscricao'

  voltarBtn.insertAdjacentElement('afterend', estadoLink)
}

async function configurarEstadoInscricao(api) {
  if (!isPagina('estado-inscricao.html') || !api) return

  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const form = document.getElementById('statusForm')
  const resultBox = document.getElementById('statusResult')

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      const value = form.token.value.trim()
      if (value) window.location.href = `estado-inscricao.html?token=${encodeURIComponent(value)}`
    })
  }

  if (!token || !resultBox) return

  const { data, error } = await api.getEstadoInscricao(token)

  if (error || !data) {
    resultBox.innerHTML = '<p>Nao encontramos nenhuma inscricao com este codigo.</p>'
    return
  }

  resultBox.innerHTML = `
    <div class="participants-table-wrapper">
      <table class="participants-table">
        <tbody>
          <tr><th>Evento</th><td>${data.evento_titulo}</td></tr>
          <tr><th>Nome</th><td>${data.nome}</td></tr>
          <tr><th>Inscricao</th><td><span class="badge ${data.estado === 'confirmada' ? 'badge-pago' : 'badge-pendente'}">${estadoInscricaoLabel(data.estado)}</span></td></tr>
          <tr><th>Pagamento</th><td><span class="badge ${data.pagamento_estado === 'validado' ? 'badge-pago' : 'badge-pendente'}">${estadoPagamentoLabel(data.pagamento_estado)}</span></td></tr>
          <tr><th>Dorsal</th><td>${data.dorsal || '-'}</td></tr>
          <tr><th>Data</th><td>${api.formatarData(data.data_inscricao)}</td></tr>
        </tbody>
      </table>
    </div>
  `
}

async function configurarAdmin(api) {
  if (!isPagina('admin.html') || !api) return

  const admin = await api.requireAdmin()
  if (!admin) return

  await Promise.all([
    carregarAdminPedidosSocio(api),
    carregarAdminInscricoes(api),
    carregarAdminQuotas(api)
  ])
}

async function carregarAdminPedidosSocio(api) {
  const tbody = document.getElementById('adminPedidosSocio')
  const count = document.getElementById('adminPedidosCount')
  if (!tbody) return

  const { data, error } = await api.getAdminPedidosSocio()
  if (error) {
    tbody.innerHTML = '<tr><td colspan="5">Nao foi possivel carregar os pedidos.</td></tr>'
    return
  }

  const pedidos = data || []
  if (count) count.textContent = pedidos.length

  if (pedidos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sem pedidos registados.</td></tr>'
    return
  }

  tbody.innerHTML = pedidos.map(pedido => `
    <tr>
      <td>${pedido.nome} ${pedido.apelido || ''}</td>
      <td>${pedido.email}</td>
      <td>${pedido.nif || '-'}</td>
      <td><span class="badge ${pedido.estado === 'aprovado' ? 'badge-pago' : 'badge-pendente'}">${pedido.estado}</span></td>
      <td>
        <button class="btn btn-small btn-primary" data-admin-action="aprovar-pedido" data-id="${pedido.id}">Aprovar</button>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('[data-admin-action="aprovar-pedido"]').forEach(button => {
    button.addEventListener('click', async function () {
      await api.atualizarPedidoSocio(this.dataset.id, { estado: 'aprovado' })
      await carregarAdminPedidosSocio(api)
    })
  })
}

async function carregarAdminInscricoes(api) {
  const tbody = document.getElementById('adminInscricoesEvento')
  const count = document.getElementById('adminInscricoesCount')
  if (!tbody) return

  const { data, error } = await api.getAdminInscricoesEvento()
  if (error) {
    tbody.innerHTML = '<tr><td colspan="5">Nao foi possivel carregar as inscricoes.</td></tr>'
    return
  }

  const inscricoes = data || []
  const pendentes = inscricoes.filter(item => item.estado === 'aguardando_pagamento')
  if (count) count.textContent = pendentes.length

  if (inscricoes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sem inscricoes registadas.</td></tr>'
    return
  }

  tbody.innerHTML = inscricoes.map(inscricao => `
    <tr>
      <td>${inscricao.eventos?.titulo || '-'}</td>
      <td>${inscricao.nome}<br><span style="font-size: 12px; color: #777;">${inscricao.email}</span></td>
      <td><span class="badge ${inscricao.pagamento_estado === 'validado' ? 'badge-pago' : 'badge-pendente'}">${estadoPagamentoLabel(inscricao.pagamento_estado)}</span></td>
      <td>${inscricao.dorsal || '-'}</td>
      <td>
        <button class="btn btn-small btn-primary" data-admin-action="confirmar-inscricao" data-id="${inscricao.id}">Confirmar</button>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('[data-admin-action="confirmar-inscricao"]').forEach(button => {
    button.addEventListener('click', async function () {
      const dorsal = window.prompt('Dorsal do participante (opcional):', '')
      await api.atualizarInscricaoEvento(this.dataset.id, {
        estado: 'confirmada',
        pagamento_estado: 'validado',
        dorsal: dorsal || null,
        data_confirmacao: new Date().toISOString()
      })
      await carregarAdminInscricoes(api)
    })
  })
}

async function carregarAdminQuotas(api) {
  const tbody = document.getElementById('adminQuotas')
  const count = document.getElementById('adminQuotasCount')
  if (!tbody) return

  const { data, error } = await api.getAdminQuotas()
  if (error) {
    tbody.innerHTML = '<tr><td colspan="5">Nao foi possivel carregar as quotas.</td></tr>'
    return
  }

  const quotas = data || []
  const pendentes = quotas.filter(quota => ['por_pagar', 'pendente_validacao'].includes(quota.estado))
  if (count) count.textContent = pendentes.length

  if (quotas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">Sem quotas registadas.</td></tr>'
    return
  }

  tbody.innerHTML = quotas.map(quota => {
    const socio = quota.utilizadores
      ? `${quota.utilizadores.nome || ''} ${quota.utilizadores.apelido || ''}`.trim() || quota.utilizadores.email
      : '-'

    return `
      <tr>
        <td>${socio}</td>
        <td>${quota.ano}</td>
        <td>${api.formatarMoeda(quota.valor)}</td>
        <td><span class="badge ${quota.estado === 'pago' ? 'badge-pago' : 'badge-pendente'}">${estadoQuotaLabel(quota.estado)}</span></td>
        <td>
          <button class="btn btn-small btn-primary" data-admin-action="validar-quota" data-id="${quota.id}">Validar</button>
        </td>
      </tr>
    `
  }).join('')

  tbody.querySelectorAll('[data-admin-action="validar-quota"]').forEach(button => {
    button.addEventListener('click', async function () {
      await api.atualizarQuota(this.dataset.id, {
        estado: 'pago',
        data_pagamento: new Date().toISOString().slice(0, 10)
      })
      await carregarAdminQuotas(api)
    })
  })
}

function configurarLogout(api) {
  const logoutBtn = document.getElementById('logoutBtn')
  if (!logoutBtn || !api) return

  logoutBtn.addEventListener('click', async function (event) {
    event.preventDefault()
    await api.logout('index.html')
  })
}

function estadoQuotaLabel(estado) {
  const labels = {
    por_pagar: 'Por Pagar',
    pendente_validacao: 'Em Validacao',
    pago: 'Pago',
    isento: 'Isento',
    cancelado: 'Cancelado'
  }

  return labels[estado] || estado
}

async function carregarEventoAtual(api) {
  const slug = getSlugEventoAtual()
  const { data } = await api.getEvento(slug)

  return data
}

function getSlugEventoAtual() {
  const params = new URLSearchParams(window.location.search)
  return params.get('evento') || 'caminhada-da-primavera'
}

function atualizarLinkInscricaoEvento() {
  const link = document.querySelector('.event-sidebar a[href="inscricao-evento.html"]')
  if (!link) return

  link.href = `inscricao-evento.html?evento=${encodeURIComponent(getSlugEventoAtual())}`
}

function adicionarLinkAdminPerfil() {
  const card = document.querySelector('.profile-card')
  if (!card || card.querySelector('[data-admin-link]')) return

  const link = document.createElement('a')
  link.href = 'admin.html'
  link.className = 'btn-outline'
  link.dataset.adminLink = 'true'
  link.textContent = 'Back-office'

  card.appendChild(link)
}

function adicionarLinkEstadoEvento() {
  const sidebar = document.querySelector('.event-sidebar')
  if (!sidebar || sidebar.querySelector('[data-status-link]')) return

  const link = document.createElement('a')
  link.href = 'estado-inscricao.html'
  link.className = 'btn-outline'
  link.dataset.statusLink = 'true'
  link.textContent = 'Ver estado da minha inscricao'

  sidebar.appendChild(link)
}

function abreviarPais(pais) {
  if (!pais) return '-'
  if (pais.length <= 3) return pais.toUpperCase()

  return pais.slice(0, 2).toUpperCase()
}

function estadoInscricaoLabel(estado) {
  const labels = {
    aguardando_pagamento: 'Aguardando Pagamento',
    confirmada: 'Confirmada',
    rejeitada: 'Rejeitada',
    cancelada: 'Cancelada'
  }

  return labels[estado] || estado
}

function estadoPagamentoLabel(estado) {
  const labels = {
    pendente: 'Pendente',
    em_validacao: 'Em Validacao',
    validado: 'Validado',
    rejeitado: 'Rejeitado'
  }

  return labels[estado] || estado
}

function configurarPreviewFoto() {
  const photoInput = document.getElementById('photoInput')
  const profileImg = document.getElementById('profileImg')

  if (profileImg) {
    const savedPhoto = localStorage.getItem('usga_photo')
    if (savedPhoto) profileImg.src = savedPhoto
  }

  if (!photoInput || !profileImg) return

  photoInput.addEventListener('change', function () {
    const file = this.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = function (event) {
      profileImg.src = event.target.result
      localStorage.setItem('usga_photo', event.target.result)
    }
    reader.readAsDataURL(file)
  })
}

function mostrarMensagemQuery(form) {
  const params = new URLSearchParams(window.location.search)
  if (params.get('registo') === 'sucesso') {
    mostrarMensagem(form, 'Conta criada. Se o Supabase pedir confirmacao, verifique o seu email antes de entrar.', 'sucesso')
  }
}

function mostrarMensagem(form, texto, tipo) {
  let message = form.querySelector('.form-message')

  if (!message) {
    message = document.createElement('p')
    message.className = 'form-message'
    message.style.marginBottom = '20px'
    message.style.fontSize = '14px'
    message.style.fontWeight = '500'
    form.prepend(message)
  }

  message.textContent = texto
  message.style.color = tipo === 'erro' ? '#d32f2f' : '#2e7d32'
}

function bloquearBotao(button, bloqueado, texto) {
  if (!button) return

  button.disabled = bloqueado
  button.textContent = texto
  button.style.opacity = bloqueado ? '0.7' : ''
  button.style.cursor = bloqueado ? 'not-allowed' : ''
}

function traduzirErroAuth(message) {
  const erro = String(message || '').toLowerCase()

  if (erro.includes('invalid login credentials')) return 'Email ou password incorretos.'
  if (erro.includes('email not confirmed')) return 'Confirme o seu email antes de iniciar sessao.'
  if (erro.includes('user already registered')) return 'Ja existe uma conta com este email.'
  if (erro.includes('password')) return 'A password nao cumpre os requisitos minimos.'

  return 'Nao foi possivel concluir a operacao. Tente novamente.'
}

function isPagina(nomeFicheiro) {
  return window.location.pathname.toLowerCase().endsWith(nomeFicheiro.toLowerCase())
}
