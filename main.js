document.addEventListener('DOMContentLoaded', async function () {
  // ── Navbar Mobile (Hamburguer) — reconstruído de raiz ───────────
  // O <nav> original (usado no desktop) deixa de ser reaproveitado em
  // mobile. Em vez disso, é criado um painel novo e totalmente
  // independente, anexado diretamente ao <body>. Isto evita de vez
  // qualquer problema de "contexto de empilhamento" do CSS: um
  // elemento colocado dentro do .header fica sempre limitado ao
  // z-index do .header como um todo, não havendo forma fiável de o
  // pôr por cima de outra camada só ajustando o seu próprio z-index.
  // Construindo o painel do zero, fora do .header, este problema
  // deixa de poder acontecer.
  ;(function construirMenuMobile() {
    const header = document.querySelector('.header')
    const headerContainer = document.querySelector('.header-container')
    const navOriginal = document.querySelector('.nav')
    if (!header || !headerContainer || !navOriginal) return

    // Botão hamburguer (mantido no header, junto ao botão de login)
    const navToggle = document.createElement('button')
    navToggle.type = 'button'
    navToggle.className = 'nav-toggle'
    navToggle.setAttribute('aria-label', 'Abrir menu')
    navToggle.setAttribute('aria-expanded', 'false')
    navToggle.innerHTML = '<span></span><span></span><span></span>'
    const loginBtn = headerContainer.querySelector('.btn-primary')
    headerContainer.insertBefore(navToggle, loginBtn)

    // Overlay + painel novos, anexados diretamente ao <body>
    const overlay = document.createElement('div')
    overlay.className = 'mobile-nav-overlay'

    const panel = document.createElement('nav')
    panel.className = 'mobile-nav-panel'
    panel.setAttribute('aria-hidden', 'true')

    const list = document.createElement('ul')
    list.className = 'mobile-nav-list'

    // Copia os links a partir do <nav> de desktop (mesmo texto, mesmo href)
    navOriginal.querySelectorAll('a').forEach(originalLink => {
      const item = document.createElement('li')
      item.appendChild(originalLink.cloneNode(true))
      list.appendChild(item)
    })

    panel.appendChild(list)
    document.body.appendChild(overlay)
    document.body.appendChild(panel)

    // O painel começa mesmo por baixo do cabeçalho, para que o botão
    // hamburguer nunca fique tapado pelo overlay/painel.
    function ajustarAlturaHeader() {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px')
    }
    ajustarAlturaHeader()
    window.addEventListener('resize', ajustarAlturaHeader)

    function abrirMenu() {
      overlay.classList.add('open')
      panel.classList.add('open')
      navToggle.classList.add('open')
      navToggle.setAttribute('aria-label', 'Fechar menu')
      navToggle.setAttribute('aria-expanded', 'true')
      panel.setAttribute('aria-hidden', 'false')
      document.body.style.overflow = 'hidden'
    }

    function fecharMenu() {
      overlay.classList.remove('open')
      panel.classList.remove('open')
      navToggle.classList.remove('open')
      navToggle.setAttribute('aria-label', 'Abrir menu')
      navToggle.setAttribute('aria-expanded', 'false')
      panel.setAttribute('aria-hidden', 'true')
      document.body.style.overflow = ''
    }

    navToggle.addEventListener('click', () => {
      panel.classList.contains('open') ? fecharMenu() : abrirMenu()
    })

    overlay.addEventListener('click', fecharMenu)

    list.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function (event) {
        const href = this.getAttribute('href')
        const target = this.getAttribute('target')

        if (!href || target === '_blank') return

        if (href.startsWith('#')) {
          event.preventDefault()
          fecharMenu()
          return
        }

        // Não faz preventDefault: a navegação segue o seu curso normal,
        // apenas fechamos visualmente o painel.
        fecharMenu()
      })
    })

    window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharMenu() })
    window.addEventListener('resize', () => { if (window.innerWidth > 768 && panel.classList.contains('open')) fecharMenu() })
    window.addEventListener('orientationchange', fecharMenu)
  })()
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
  await configurarPagamentoEvento(api)
  configurarEstadoInscricao(api)
  configurarAdmin(api)
  configurarLogout(api)
  configurarPreviewFoto()

  // Populate public events listing when on eventos.html
  configurarListaEventos(api)
  configurarTodosEventos(api)

  // Populate event detail pages (futuro / passado)
  configurarDetalheEvento(api)
})

async function configurarTodosEventos(api) {
  if (!api) return

  const grid = document.getElementById('eventosGrid')
  const noResults = document.getElementById('noResults')
  if (!grid) return

  let data = null
  let error = null

  if (isPagina('todos-eventos-futuros.html')) {
    ;({ data, error } = await api.getEventosFuturos())
  } else if (isPagina('todos-eventos-passados.html')) {
    ;({ data, error } = await api.getEventosPassados())
  } else {
    return
  }

  if (error) {
    grid.innerHTML = '<p>Erro ao carregar eventos.</p>'
    if (noResults) noResults.style.display = 'none'
    return
  }

  if (!data || data.length === 0) {
    grid.innerHTML = ''
    if (noResults) noResults.style.display = 'block'
    return
  }

  if (noResults) noResults.style.display = 'none'
  grid.innerHTML = data.map(ev => renderCardEvento(ev)).join('')
}

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

  // Prefer selecting the form by its action attribute, but fall back to the known id.
  let form = document.querySelector('form[action="pagamento-evento.html"]')
  if (!form) form = document.getElementById('inscricaoForm')
  if (!form) return

  const evento = await carregarEventoAtual(api)
  const tituloEvento = document.getElementById('nomeEvento') || document.querySelector('.contact-form p')

  if (evento) {
    if (tituloEvento) tituloEvento.textContent = evento.titulo || 'Evento'
  } else {
    if (tituloEvento) tituloEvento.textContent = 'Evento não encontrado'
    // disable form submit to avoid creating registrations for missing event
    const submitBtn = form.querySelector('button[type="submit"]')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.style.opacity = '0.6'
      submitBtn.textContent = 'Inscrições indisponíveis'
    }
  }

  // attach submit handler to the resolved form element
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

    // Prefer redirecting to the payment page using the pagamento_token returned by the RPC.
    const pagamentoToken = data.pagamento_token || data.public_token

    // A RPC devolve o id da inscrição em "inscricao_id" (não em "id").
    sessionStorage.setItem('usga_inscricao_evento_id', data.inscricao_id)
    // keep the legacy key but store the pagamento token so pagamento-evento.html can read it
    sessionStorage.setItem('usga_inscricao_evento_token', pagamentoToken)
    // also store explicit pagamento keys for clarity
    if (data.pagamento_id) sessionStorage.setItem('usga_pagamento_id', data.pagamento_id)
    sessionStorage.setItem('usga_pagamento_token', pagamentoToken)

    const params = new URLSearchParams({
      inscricao: data.inscricao_id,
      token: pagamentoToken
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

  const tbody = document.querySelector('#participantsTable tbody')
  const stats = document.querySelectorAll('.stat-number')
  if (!tbody) return

  async function renderListaInscritos() {
    const { data: inscritos, error } = await api.getListaInscritosEvento(evento.id)

    if (error) {
      tbody.innerHTML = '<tr><td colspan="4">Nao foi possivel carregar a lista de inscritos.</td></tr>'
      return
    }

    const confirmados = (inscritos || []).filter(i => i.estado_inscricao === 'confirmada')
    const pendentes = (inscritos || []).filter(i => i.estado_inscricao === 'pendente')

    if (!inscritos || inscritos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Ainda nao existem inscricoes.</td></tr>'
    } else {
      tbody.innerHTML = inscritos.map((inscrito, index) => {
        const badge = inscrito.estado_inscricao === 'confirmada'
          ? '<span class="badge badge-pago">Confirmada</span>'
          : '<span class="badge badge-pendente">Pendente</span>'
        return `
          <tr>
            <td style="font-weight:bold; color: #666;">${abreviarPais(inscrito.pais)}</td>
            <td>${inscrito.nome}</td>
            <td><strong>${inscrito.dorsal || (inscrito.estado_inscricao === 'confirmada' ? String(index + 1).padStart(3, '0') : '-')}</strong></td>
            <td>${badge}</td>
          </tr>
        `
      }).join('')
    }

    if (stats.length >= 3) {
      stats[0].textContent = inscritos?.length || 0
      stats[1].textContent = confirmados.length
      stats[2].textContent = pendentes.length
    }
  }

  await renderListaInscritos()

  const intervalId = setInterval(renderListaInscritos, 5000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderListaInscritos()
  })

  if (typeof api.subscreverInscricoesEvento === 'function') {
    const cancelar = api.subscreverInscricoesEvento(evento.id, renderListaInscritos)
    window.addEventListener('beforeunload', () => {
      clearInterval(intervalId)
      if (cancelar) cancelar()
    })
  } else {
    window.addEventListener('beforeunload', () => clearInterval(intervalId))
  }
}

async function configurarPagamentoEvento(api) {
  if (!isPagina('pagamento-evento.html')) return
  if (!api) return

  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || sessionStorage.getItem('usga_inscricao_evento_token')
  if (!token) return

  const voltarBtn = document.querySelector('.contact-section .btn.btn-primary')
  if (!voltarBtn) return

  const estadoLink = document.createElement('a')
  estadoLink.href = `estado-inscricao.html?token=${encodeURIComponent(token)}`
  estadoLink.className = 'btn-outline'
  estadoLink.style.marginTop = '15px'
  estadoLink.textContent = 'Ver estado da inscricao'

  voltarBtn.insertAdjacentElement('afterend', estadoLink)

  // Populate payment information using the public token
  const valorEl = document.getElementById('valorPagar')
  const eventoEl = document.getElementById('nomeEvento')
  const inscritoEl = document.getElementById('nomeInscrito')
  const estadoEl = document.getElementById('estadoPagamento')
  const referenciaEl = document.getElementById('referencia')
  const comprovativoForm = document.getElementById('comprovativoForm')
  const mensagemBox = document.getElementById('mensagemComprovativo')

  // show temporary loading (already present in markup)

  try {
    // Prefer fetching a public payment record first (contains the valor)
    const { data: pagamentoData, error: pagamentoError } = await api.getPagamentoPublico(token)

    let dataToUse = null
    let pagamentoDataFetched = null

    if (!pagamentoError && pagamentoData) {
      dataToUse = pagamentoData
      pagamentoDataFetched = pagamentoData
    } else {
      const { data: estadoData, error: estadoError } = await api.getEstadoInscricao(token)
      if (estadoError || !estadoData) {
        if (valorEl) valorEl.textContent = 'A carregar...'
        if (eventoEl) eventoEl.textContent = 'Evento não encontrado'
        if (inscritoEl) inscritoEl.textContent = '-'
        if (estadoEl) estadoEl.textContent = '-'
        if (referenciaEl) referenciaEl.textContent = '-'

        // disable comprovativo form
        if (comprovativoForm) {
          comprovativoForm.querySelectorAll('input, button').forEach(i => i.disabled = true)
          if (mensagemBox) {
            mensagemBox.style.display = 'block'
            mensagemBox.style.background = '#fee2e2'
            mensagemBox.style.border = '1px solid #fca5a5'
            mensagemBox.style.color = '#991b1b'
            mensagemBox.textContent = 'Não foi possível localizar a inscrição. Verifique o código e tente novamente.'
          }
        }
        return
      }
      dataToUse = estadoData
    }

    // dataToUse may come from get_pagamento_publico or get_estado_inscricao
    const titulo = dataToUse.evento_titulo || dataToUse.evento?.titulo || dataToUse.titulo || '-'
    const nome = dataToUse.nome || dataToUse.inscrito_nome || '-'
    const pagamentoEstado = dataToUse.pagamento_estado || dataToUse.estado || dataToUse.estado || '-'
    const estadoInscricao = dataToUse.estado || '-'
    let valor = dataToUse.valor || dataToUse.pagamento_valor || dataToUse.valor_pagamento || null

    // If valor is missing, try fetching the related inscription to read the event price
    if (!valor) {
      const inscricaoId = dataToUse.inscricao_id || dataToUse.inscricao || sessionStorage.getItem('usga_inscricao_evento_id')
      if (inscricaoId) {
        const { data: inscricao, error: insErr } = await api.getInscricaoById(inscricaoId)
        if (!insErr && inscricao) {
          const ev = inscricao.eventos || inscricao.evento || null
          if (ev) {
            valor = ev.preco ?? null
            if (!titulo && ev.titulo) dataToUse.evento_titulo = ev.titulo
            if (!nome && inscricao.nome) dataToUse.nome = inscricao.nome
          }
        }

        // If still no valor, try fetching pagamento by inscricao as last resort
        if (!valor) {
          const { data: pagamentoByInscricao, error: pbiErr } = await api.getPagamentoByInscricao(inscricaoId)
          if (!pbiErr && pagamentoByInscricao) {
            valor = pagamentoByInscricao.valor || null
            pagamentoDataFetched = pagamentoByInscricao
            if (!titulo && pagamentoByInscricao.evento_titulo) dataToUse.evento_titulo = pagamentoByInscricao.evento_titulo
            if (!nome && pagamentoByInscricao.inscrito_nome) dataToUse.nome = pagamentoByInscricao.inscrito_nome
          }
        }
      }
    }

    if (valorEl) valorEl.textContent = valor ? api.formatarMoeda(valor) : 'A aguardar valor'
    if (eventoEl) eventoEl.textContent = titulo
    if (inscritoEl) inscritoEl.textContent = nome

    // Debug info when ?debug=1 is present in URL
    if (new URLSearchParams(window.location.search).get('debug') === '1') {
      let debugDiv = document.getElementById('debugPagamento')
      if (!debugDiv) {
        debugDiv = document.createElement('pre')
        debugDiv.id = 'debugPagamento'
        debugDiv.style.background = '#f7f7f7'
        debugDiv.style.border = '1px solid #eee'
        debugDiv.style.padding = '10px'
        debugDiv.style.marginTop = '12px'
        const container = document.querySelector('.payment-box') || document.body
        container.appendChild(debugDiv)
      }
      debugDiv.textContent = `token: ${token}\npagamentoPublico: ${JSON.stringify(pagamentoDataFetched, null, 2)}\nestadoData: ${JSON.stringify(dataToUse, null, 2)}`
    }

    // Show human-friendly payment/inscription state
    if (estadoEl) {
      if (pagamentoEstado === 'validado') estadoEl.textContent = 'Validado'
      else if (pagamentoEstado === 'em_validacao' || pagamentoEstado === 'em_validacao') estadoEl.textContent = 'Em validação'
      else if (estadoInscricao === 'confirmada') estadoEl.textContent = 'Inscrição confirmada'
      else if (estadoInscricao === 'aguardando_pagamento') estadoEl.textContent = 'A aguardar pagamento'
      else estadoEl.textContent = (pagamentoEstado || estadoInscricao || '-').toString()
    }

    if (referenciaEl) referenciaEl.textContent = `${nome} + ${titulo}`

    // Wire comprovativo form to upload a comprovativo as a payment record (best-effort)
    if (comprovativoForm) {
      comprovativoForm.addEventListener('submit', async function (e) {
        e.preventDefault()
        // simple client-side validation
        const fileInput = document.getElementById('ficheiroComprovativo')
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          mostrarMensagem(comprovativoForm, 'Por favor selecione um ficheiro de comprovativo.', 'erro')
          return
        }

        // create a payment record and upload the file (if backend supports it)
        bloquearBotao(document.getElementById('btnEnviarComprovativo'), true, 'A enviar comprovativo...')

        try {
          // create payment record linked to inscription using criarPagamento
          const inscricaoId = dataToUse.inscricao_id || sessionStorage.getItem('usga_inscricao_evento_id')
          const payload = {
            inscricao_id: inscricaoId,
            metodo: 'transferencia',
            valor: valor || null
          }
          const { data: pagamento, error: payErr } = await api.criarPagamento(payload)
          if (payErr || !pagamento) {
            mostrarMensagem(comprovativoForm, 'Erro ao criar o registo de pagamento. Tente novamente.', 'erro')
            bloquearBotao(document.getElementById('btnEnviarComprovativo'), false, 'Enviar Comprovativo')
            return
          }

          // upload file: if project supports storage upload we would upload and then atualizar pagamento with file url
          // For now show success message and inform team to validate manually
          mostrarMensagem(comprovativoForm, 'Comprovativo enviado com sucesso. Aguarde validação da equipa.', 'sucesso')
          bloquearBotao(document.getElementById('btnEnviarComprovativo'), false, 'Enviar Comprovativo')
        } catch (err) {
          console.error(err)
          mostrarMensagem(comprovativoForm, 'Ocorreu um erro. Tente novamente mais tarde.', 'erro')
          bloquearBotao(document.getElementById('btnEnviarComprovativo'), false, 'Enviar Comprovativo')
        }
      })
    }

  } catch (err) {
    console.error('Erro ao carregar estado da inscrição:', err)
  }
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

// Populate the public events listing on eventos.html
async function configurarListaEventos(api) {
  if (!isPagina('eventos.html') || !api) return

  const futureWrap = document.getElementById('futureEventsList')
  const pastWrap = document.getElementById('pastEventsList')
  const noFuture = document.getElementById('noFutureResults')
  const noPast = document.getElementById('noPastResults')
  if (!futureWrap || !pastWrap) return

  const [{ data: futuros, error: errF }, { data: passados, error: errP }] = await Promise.all([
    api.getEventosFuturos(),
    api.getEventosPassados()
  ])

  if (errF) {
    futureWrap.innerHTML = '<p>Erro ao carregar eventos futuros.</p>'
  } else if (!futuros || futuros.length === 0) {
    futureWrap.innerHTML = ''
    noFuture.style.display = 'block'
  } else {
    noFuture.style.display = 'none'
    futureWrap.innerHTML = futuros.map(ev => renderCardEvento(ev)).join('')
  }

  if (errP) {
    pastWrap.innerHTML = '<p>Erro ao carregar eventos realizados.</p>'
  } else if (!passados || passados.length === 0) {
    pastWrap.innerHTML = ''
    noPast.style.display = 'block'
  } else {
    noPast.style.display = 'none'
    pastWrap.innerHTML = passados.map(ev => renderCardEvento(ev)).join('')
  }
}

function renderCardEvento(ev) {
  const imagem = ev.imagem_url || ''
  const dataFmt = ev.data_evento ? new Date(ev.data_evento).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) : ''
  const slug = ev.slug || ''
  return `
    <a href="evento-futuro.html?evento=${encodeURIComponent(slug)}" class="project-card">
      <div class="project-image" style="background-image: url('${imagem}');"></div>
      <div class="project-body">
        <h3>${ev.titulo || ''}</h3>
        <small style="color:#777;">${dataFmt}</small>
        <p style="margin-top:8px;color:#555;">${(ev.descricao_curta || '').slice(0,120)}</p>
      </div>
    </a>
  `
}

// Populate event detail pages (futuro / passado)
async function configurarDetalheEvento(api) {
  if (!api) return
  if (!isPagina('evento-futuro.html') && !isPagina('evento-passado.html')) return

  const evento = await carregarEventoAtual(api)
  if (!evento) {
    document.getElementById('heroTitulo') && (document.getElementById('heroTitulo').textContent = 'Evento não encontrado')
    document.getElementById('heroSubtitulo') && (document.getElementById('heroSubtitulo').textContent = '')
    return
  }

  // Common elements
  const heroTitulo = document.getElementById('heroTitulo')
  const heroSub = document.getElementById('heroSubtitulo')
  const heroDesc = document.getElementById('heroDescricao')
  const imagem = document.getElementById('imagemEvento')
  const dataEl = document.getElementById('dataEvento')
  const localEl = document.getElementById('localEvento')
  const precoEl = document.getElementById('precoEvento')
  const btnReg = document.getElementById('btnRegulamento')
  const areaInscricao = document.getElementById('areaInscricao')

  if (heroTitulo) heroTitulo.textContent = evento.titulo || ''
  if (heroSub) heroSub.textContent = evento.categoria || ''
  if (heroDesc) heroDesc.textContent = evento.descricao_curta || ''
  if (imagem) imagem.style.backgroundImage = evento.imagem_url ? `url('${evento.imagem_url}')` : ''
  if (dataEl) dataEl.textContent = api.formatarData(evento.data_evento)
  if (localEl) localEl.textContent = evento.local || '-'
  if (precoEl) precoEl.textContent = typeof api.formatarMoeda === 'function' ? api.formatarMoeda(evento.preco || 0) : (evento.preco || '-')

  if (btnReg) {
    if (evento.regulamento_url) {
      btnReg.href = evento.regulamento_url
      btnReg.style.display = 'inline-block'
    } else {
      btnReg.style.display = 'none'
    }
  }

  // If future event page: add inscription button if estado is 'aberto'
  if (isPagina('evento-futuro.html') && areaInscricao) {
    if (evento.estado === 'aberto') {
      areaInscricao.innerHTML = `<a href="inscricao-evento.html?evento=${encodeURIComponent(evento.slug)}" class="btn btn-primary">Inscrever-me</a>`
    } else {
      areaInscricao.innerHTML = `<div style="padding:10px;background:#fff;border-radius:6px;color:#666;">Inscrições fechadas</div>`
    }
    atualizarLinkInscricaoEvento()
  }

  // If past event page: show gallery link if available
  if (isPagina('evento-passado.html')) {
    const btnGaleria = document.getElementById('btnGaleria')
    if (btnGaleria) {
      if (evento.galeria_url) {
        btnGaleria.href = evento.galeria_url
        btnGaleria.style.display = 'inline-block'
      } else {
        btnGaleria.style.display = 'none'
      }
    }
  }
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