import './style.css'
import { nhost } from './nhost.js'

/* =========================================================
   Utilitários
   ========================================================= */

const $ = (id) => document.getElementById(id)

const STATUS = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
}

const ICONES = {
  anexo:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  editar:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  excluir:
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
}

// Evita que texto digitado vire HTML (proteção contra XSS)
const esc = (texto = '') =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function toast(mensagem, tipo = 'ok') {
  const el = document.createElement('div')
  el.className = `toast ${tipo === 'erro' ? 'erro' : ''}`
  el.textContent = mensagem
  $('toasts').appendChild(el)
  setTimeout(() => el.remove(), 3800)
}

// Converte as mensagens de erro da Nhost (em inglês) para algo amigável
function traduzirErro(err) {
  const original = err?.message || ''
  const msg = original.toLowerCase()

  if (msg.includes('incorrect email or password')) return 'E-mail ou senha incorretos.'
  if (msg.includes('already in use') || msg.includes('already exists')) return 'Este e-mail já está cadastrado. Tente entrar.'
  if (msg.includes('not verified') || msg.includes('verify')) return 'Confirme seu e-mail antes de entrar.'
  if (msg.includes('password') && /(short|length|weak|pwned|compromised|least)/.test(msg))
    return 'Senha curta ou fraca demais. Use uma senha mais longa e menos comum.'
  if (msg.includes('email') && msg.includes('invalid')) return 'Digite um e-mail válido.'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet.'

  return original || 'Algo deu errado. Tente novamente.'
}

// Executa uma consulta GraphQL e lança erro se o Hasura devolver "errors"
async function gql(query, variables) {
  const res = await nhost.graphql.request({ query, variables })
  const body = res.body
  if (body?.errors?.length) throw new Error(body.errors[0].message)
  return body.data
}

// Desativa o botão e troca o texto enquanto a tarefa roda
async function comOcupado(botao, textoOcupado, tarefa) {
  const original = botao.textContent
  botao.disabled = true
  botao.textContent = textoOcupado
  try {
    return await tarefa()
  } finally {
    botao.disabled = false
    botao.textContent = original
  }
}

function primeiroNome(user) {
  const nomeSalvo = user?.displayName && !user.displayName.includes('@') ? user.displayName : null
  const base = nomeSalvo || (user?.email || '').split('@')[0]
  const nome = base.split(/[.\s_-]+/)[0] || 'estudante'
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/* =========================================================
   Elementos da interface
   ========================================================= */

const authContainer = $('auth-container')
const appContainer = $('app-container')

const formAuth = $('form-auth')
const emailInput = $('email')
const passwordInput = $('password')
const btnEntrar = $('btn-entrar')
const btnCadastrar = $('btn-cadastrar')
const authMsg = $('auth-msg')
const btnSair = $('btn-sair')

const tituloInput = $('titulo')
const descricaoInput = $('descricao')
const arquivoInput = $('arquivo')
const arquivoNome = $('arquivo-nome')
const btnCriar = $('btn-criar')
const listaMaterias = $('lista-materias')

const btnResumo = $('btn-resumo')
const resultadoResumo = $('resultado-resumo')

const dialogEditar = $('dialog-editar')
const formEditar = $('form-editar')
const editTitulo = $('edit-titulo')
const editDescricao = $('edit-descricao')
const btnSalvarEdicao = $('btn-salvar-edicao')

/* =========================================================
   Estado
   ========================================================= */

let materias = []
let filtro = 'todas'
let editandoId = null

/* =========================================================
   Sessão e telas
   ========================================================= */

function atualizarInterface() {
  const session = nhost.getUserSession()

  if (session) {
    authContainer.classList.add('oculto')
    appContainer.classList.remove('oculto')
    $('user-email').textContent = session.user?.email ?? ''
    $('saudacao').textContent = `Olá, ${primeiroNome(session.user)}!`
    carregarMaterias()
  } else {
    appContainer.classList.add('oculto')
    authContainer.classList.remove('oculto')
    materias = []
    filtro = 'todas'
    listaMaterias.innerHTML = ''
    resultadoResumo.innerHTML = ''
    passwordInput.value = ''
  }
}

/* =========================================================
   Autenticação
   ========================================================= */

function mostrarMsgAuth(texto, tipo = 'erro') {
  authMsg.textContent = texto
  authMsg.classList.toggle('ok', tipo === 'ok')
}

function ocuparAuth(ocupado) {
  btnEntrar.disabled = ocupado
  btnCadastrar.disabled = ocupado
}

function lerCredenciais() {
  const email = emailInput.value.trim()
  const password = passwordInput.value

  if (!email || !password) {
    mostrarMsgAuth('Preencha o e-mail e a senha.')
    return null
  }
  return { email, password }
}

formAuth.addEventListener('submit', async (e) => {
  e.preventDefault()
  mostrarMsgAuth('')
  const credenciais = lerCredenciais()
  if (!credenciais) return

  ocuparAuth(true)
  btnEntrar.textContent = 'Entrando…'
  try {
    await nhost.auth.signInEmailPassword(credenciais)
    if (!nhost.getUserSession()) {
      mostrarMsgAuth('Não foi possível iniciar a sessão. Tente novamente.')
      return
    }
    atualizarInterface()
  } catch (err) {
    console.error(err)
    mostrarMsgAuth(traduzirErro(err))
  } finally {
    ocuparAuth(false)
    btnEntrar.textContent = 'Entrar'
  }
})

btnCadastrar.addEventListener('click', async () => {
  mostrarMsgAuth('')
  const credenciais = lerCredenciais()
  if (!credenciais) return

  ocuparAuth(true)
  btnCadastrar.textContent = 'Criando…'
  try {
    await nhost.auth.signUpEmailPassword(credenciais)

    if (nhost.getUserSession()) {
      toast('Conta criada! Bem-vindo ao StudyHub.')
      atualizarInterface()
    } else {
      mostrarMsgAuth('Conta criada. Confirme seu e-mail para poder entrar.', 'ok')
    }
  } catch (err) {
    console.error(err)
    mostrarMsgAuth(traduzirErro(err))
  } finally {
    ocuparAuth(false)
    btnCadastrar.textContent = 'Criar conta'
  }
})

btnSair.addEventListener('click', async () => {
  const session = nhost.getUserSession()
  try {
    // Invalida o refresh token no servidor
    if (session) await nhost.auth.signOut({ refreshToken: session.refreshTokenId })
  } catch (err) {
    console.warn('Não foi possível encerrar a sessão no servidor:', err)
  } finally {
    // Remove a sessão deste navegador de qualquer forma
    nhost.clearSession()
    atualizarInterface()
  }
})

/* =========================================================
   Função serverless: resumo de estudos
   ========================================================= */

btnResumo.addEventListener('click', () =>
  comOcupado(btnResumo, 'Gerando…', async () => {
    resultadoResumo.innerHTML = ''
    try {
      // O SDK já envia o token do usuário e usa o endereço da função do seu projeto
      const resp = await nhost.functions.post('/resumo', {})
      const dados = resp.body

      if (dados?.erro) throw new Error(dados.erro)

      const aFazer = Math.max(0, dados.total - dados.emAndamento - dados.concluidas)
      resultadoResumo.innerHTML = `
        <div class="stats">
          <div class="stat"><strong>${aFazer}</strong><span>A fazer</span></div>
          <div class="stat"><strong>${dados.emAndamento}</strong><span>Em andamento</span></div>
          <div class="stat"><strong>${dados.concluidas}</strong><span>Concluídas</span></div>
        </div>`
    } catch (err) {
      console.error(err)
      resultadoResumo.innerHTML =
        '<p class="resumo-erro">Não foi possível gerar o resumo. Confirme se a função "resumo" foi publicada no painel da Nhost.</p>'
    }
  })
)

/* =========================================================
   Matérias: leitura e exibição
   ========================================================= */

async function carregarMaterias() {
  listaMaterias.innerHTML = '<p class="estado">Carregando suas matérias…</p>'

  try {
    const data = await gql(`query {
      materias(order_by: {created_at: desc}) {
        id
        titulo
        descricao
        status
        file_id
      }
    }`)
    materias = data.materias
    renderizar()
  } catch (err) {
    console.error('Erro ao carregar matérias:', err)
    listaMaterias.innerHTML =
      '<p class="estado"><strong>Não foi possível carregar</strong>Verifique sua conexão e as permissões da tabela "materias" no Hasura.</p>'
  }
}

function htmlMateria(m) {
  const status = STATUS[m.status] ? m.status : 'a_fazer'
  const id = esc(m.id)

  const botoesStatus = Object.entries(STATUS)
    .map(
      ([valor, rotulo]) =>
        `<button type="button" data-action="status" data-id="${id}" data-status="${valor}" aria-pressed="${valor === status}">${rotulo}</button>`
    )
    .join('')

  const anexo = m.file_id
    ? `<button type="button" class="chip-anexo" data-action="anexo" data-file="${esc(m.file_id)}">${ICONES.anexo} Abrir anexo</button>`
    : ''

  const descricao = m.descricao
    ? `<p class="materia-desc">${esc(m.descricao)}</p>`
    : '<p class="materia-desc vazio">Sem descrição</p>'

  return `
    <article class="materia" data-status="${status}">
      <div class="materia-body">
        <h3>${esc(m.titulo)}</h3>
        ${descricao}
        ${anexo}
      </div>
      <div class="materia-side">
        <div class="seg" role="group" aria-label="Status de ${esc(m.titulo)}">${botoesStatus}</div>
        <div class="materia-tools">
          <button type="button" class="tool" data-action="editar" data-id="${id}">${ICONES.editar} Editar</button>
          <button type="button" class="tool danger" data-action="excluir" data-id="${id}">${ICONES.excluir} Excluir</button>
        </div>
      </div>
    </article>`
}

function renderizar() {
  const contagem = {
    todas: materias.length,
    a_fazer: materias.filter((m) => m.status === 'a_fazer').length,
    em_andamento: materias.filter((m) => m.status === 'em_andamento').length,
    concluido: materias.filter((m) => m.status === 'concluido').length,
  }

  // Filtros
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = contagem[el.dataset.count]
  })
  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === filtro))
  })

  // Progresso
  const total = contagem.todas
  const pct = total ? Math.round((contagem.concluido / total) * 100) : 0
  $('progress-bar').style.width = `${pct}%`
  document.querySelector('.progress').setAttribute('aria-valuenow', String(pct))
  $('progresso-texto').textContent = total
    ? `${contagem.concluido} de ${total} ${total === 1 ? 'matéria concluída' : 'matérias concluídas'}`
    : 'Comece adicionando sua primeira matéria.'

  // Lista
  if (total === 0) {
    listaMaterias.innerHTML =
      '<p class="estado"><strong>Seu caderno está vazio</strong>Preencha o formulário ao lado para adicionar a primeira matéria.</p>'
    return
  }

  const visiveis = filtro === 'todas' ? materias : materias.filter((m) => m.status === filtro)

  listaMaterias.innerHTML = visiveis.length
    ? visiveis.map(htmlMateria).join('')
    : '<p class="estado"><strong>Nada por aqui</strong>Nenhuma matéria com esse status.</p>'
}

/* =========================================================
   Matérias: criar
   ========================================================= */

arquivoInput.addEventListener('change', () => {
  arquivoNome.textContent = arquivoInput.files[0]?.name || 'Escolher arquivo'
})

btnCriar.addEventListener('click', () => {
  const titulo = tituloInput.value.trim()
  const descricao = descricaoInput.value.trim()
  const arquivo = arquivoInput.files[0]

  if (!titulo) {
    toast('Digite o nome da matéria.', 'erro')
    tituloInput.focus()
    return
  }

  return comOcupado(btnCriar, 'Adicionando…', async () => {
    let fileId = null
    try {
      if (arquivo) {
        const up = await nhost.storage.uploadFiles({
          'bucket-id': 'default',
          'file[]': [arquivo],
        })
        fileId = up.body?.processedFiles?.[0]?.id ?? null
        if (!fileId) throw new Error('Não foi possível enviar o arquivo.')
      }

      await gql(
        `mutation($titulo: String!, $descricao: String!, $file_id: uuid) {
          insert_materias_one(object: {titulo: $titulo, descricao: $descricao, file_id: $file_id}) { id }
        }`,
        { titulo, descricao, file_id: fileId }
      )

      tituloInput.value = ''
      descricaoInput.value = ''
      arquivoInput.value = ''
      arquivoNome.textContent = 'Escolher arquivo'
      toast('Matéria adicionada.')
      await carregarMaterias()
    } catch (err) {
      console.error('Erro ao criar matéria:', err)
      // Se o arquivo subiu mas a matéria não foi criada, apaga o arquivo para não sobrar lixo
      if (fileId) nhost.storage.deleteFile(fileId).catch(() => {})
      toast(traduzirErro(err), 'erro')
    }
  })
})

/* =========================================================
   Matérias: status, editar, excluir e anexo
   ========================================================= */

async function alterarStatus(id, status) {
  const atual = materias.find((m) => m.id === id)
  if (!atual || atual.status === status) return

  try {
    await gql(
      `mutation($id: uuid!, $status: String!) {
        update_materias_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id }
      }`,
      { id, status }
    )
    atual.status = status
    renderizar()
  } catch (err) {
    console.error('Erro ao atualizar status:', err)
    toast('Não foi possível atualizar o status.', 'erro')
  }
}

function abrirEdicao(id) {
  const materia = materias.find((m) => m.id === id)
  if (!materia) return
  editandoId = id
  editTitulo.value = materia.titulo
  editDescricao.value = materia.descricao || ''
  dialogEditar.showModal()
  editTitulo.focus()
}

formEditar.addEventListener('submit', async (e) => {
  e.preventDefault()
  const titulo = editTitulo.value.trim()
  const descricao = editDescricao.value.trim()
  if (!titulo || !editandoId) return

  await comOcupado(btnSalvarEdicao, 'Salvando…', async () => {
    try {
      await gql(
        `mutation($id: uuid!, $titulo: String!, $descricao: String!) {
          update_materias_by_pk(pk_columns: {id: $id}, _set: {titulo: $titulo, descricao: $descricao}) { id }
        }`,
        { id: editandoId, titulo, descricao }
      )
      const materia = materias.find((m) => m.id === editandoId)
      if (materia) {
        materia.titulo = titulo
        materia.descricao = descricao
      }
      renderizar()
      dialogEditar.close()
      toast('Alterações salvas.')
    } catch (err) {
      console.error('Erro ao editar matéria:', err)
      toast('Não foi possível salvar as alterações.', 'erro')
    }
  })
})

$('btn-cancelar-edicao').addEventListener('click', () => dialogEditar.close())
dialogEditar.addEventListener('click', (e) => {
  if (e.target === dialogEditar) dialogEditar.close() // clique fora da janela
})

async function excluirMateria(id) {
  const materia = materias.find((m) => m.id === id)
  if (!materia) return
  if (!confirm(`Excluir "${materia.titulo}"? Essa ação não pode ser desfeita.`)) return

  try {
    await gql(`mutation($id: uuid!) { delete_materias_by_pk(id: $id) { id } }`, { id })
    // Remove também o anexo do Storage (se não houver permissão, apenas ignora)
    if (materia.file_id) nhost.storage.deleteFile(materia.file_id).catch(() => {})
    materias = materias.filter((m) => m.id !== id)
    renderizar()
    toast('Matéria excluída.')
  } catch (err) {
    console.error('Erro ao excluir matéria:', err)
    toast('Não foi possível excluir a matéria.', 'erro')
  }
}

async function abrirAnexo(fileId) {
  // Abre a aba antes do download para o navegador não bloquear o pop-up
  const aba = window.open('', '_blank')
  try {
    const resp = await nhost.storage.getFile(fileId)
    const url = URL.createObjectURL(resp.body)

    if (aba) {
      aba.location.href = url
    } else {
      const link = document.createElement('a')
      link.href = url
      link.download = 'anexo'
      link.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    console.error('Erro ao abrir anexo:', err)
    aba?.close()
    toast('Não foi possível abrir o anexo.', 'erro')
  }
}

// Um único "ouvinte" cuida de todos os botões da lista
listaMaterias.addEventListener('click', (e) => {
  const botao = e.target.closest('[data-action]')
  if (!botao) return
  const { action, id, status, file } = botao.dataset

  if (action === 'status') alterarStatus(id, status)
  if (action === 'editar') abrirEdicao(id)
  if (action === 'excluir') excluirMateria(id)
  if (action === 'anexo') abrirAnexo(file)
})

document.querySelector('.filters').addEventListener('click', (e) => {
  const pill = e.target.closest('[data-filter]')
  if (!pill) return
  filtro = pill.dataset.filter
  renderizar()
})

/* =========================================================
   Início
   ========================================================= */

atualizarInterface()
