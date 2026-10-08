import { nhost } from './nhost.js'

// Elementos da Interface
const authContainer = document.getElementById('auth-container')
const appContainer = document.getElementById('app-container')

const emailInput = document.getElementById('email')
const passwordInput = document.getElementById('password')
const btnEntrar = document.getElementById('btn-entrar')
const btnCadastrar = document.getElementById('btn-cadastrar')
const btnSair = document.getElementById('btn-sair')

const tituloInput = document.getElementById('titulo')
const descricaoInput = document.getElementById('descricao')
const arquivoInput = document.getElementById('arquivo')
const btnCriar = document.getElementById('btn-criar')
const listaMaterias = document.getElementById('lista-materias')

const btnResumo = document.getElementById('btn-resumo')
const resultadoResumo = document.getElementById('resultado-resumo')

// --- CONTROLO DE SESSÃO E ECRÃS ---
function atualizarInterface() {
  const session = nhost.auth.getSession()
  
  if (session) {
    authContainer.classList.add('oculto')
    appContainer.classList.remove('oculto')
    carregarMaterias()
  } else {
    authContainer.classList.remove('oculto')
    appContainer.classList.add('oculto')
    listaMaterias.innerHTML = ''
    resultadoResumo.innerHTML = ''
  }
}

// --- AUTENTICAÇÃO ---

btnCadastrar.addEventListener('click', async () => {
  const email = emailInput.value
  const password = passwordInput.value
  const res = await nhost.auth.signUpEmailPassword({ email, password })
  
  if (res.error) {
    alert('Erro no cadastro: ' + res.error.message)
  } else {
    alert('Cadastro realizado com sucesso!')
    atualizarInterface()
  }
})

btnEntrar.addEventListener('click', async () => {
  const email = emailInput.value
  const password = passwordInput.value
  const res = await nhost.auth.signInEmailPassword({ email, password })
  
  if (res.error) {
    alert('Erro ao entrar: ' + res.error.message)
  } else {
    atualizarInterface()
  }
})

btnSair.addEventListener('click', async () => {
  await nhost.auth.signOut()
  atualizarInterface()
})

// --- FASE 7: CHAMADA DA FUNÇÃO SERVERLESS ---

btnResumo.addEventListener('click', async () => {
  resultadoResumo.innerHTML = '<small>A carregar resumo...</small>'

  const res = await nhost.functions.call('resumo')

  if (res.error) {
    console.error('Erro na serverless function:', res.error)
    resultadoResumo.innerHTML = '<span style="color:red">Erro ao carregar resumo.</span>'
    return
  }

  const { total, concluidas, emAndamento } = res.res.data

  resultadoResumo.innerHTML = `
    <p style="margin: 0;"><strong>Total de Matérias:</strong> ${total}</p>
    <p style="margin: 0;"><strong>Em Andamento:</strong> ${emAndamento}</p>
    <p style="margin: 0;"><strong>Concluídas:</strong> ${concluidas}</p>
  `
})

// --- CRUD MATÉRIAS E ANEXOS ---

async function carregarMaterias() {
  const res = await nhost.graphql.request({
    query: `query {
      materias(order_by: {created_at: desc}) {
        id
        titulo
        descricao
        status
        file_id
      }
    }`
  })

  if (res.error) {
    console.error('Erro ao carregar matérias:', res.error)
    return
  }

  const materias = res.data.materias
  
  if (materias.length === 0) {
    listaMaterias.innerHTML = '<p>Nenhuma matéria cadastrada ainda.</p>'
    return
  }

  listaMaterias.innerHTML = materias.map(materia => {
    let linkAnexo = ''
    if (materia.file_id) {
      const fileUrl = nhost.storage.getPublicUrl({ fileId: materia.file_id })
      linkAnexo = `<a href="${fileUrl}" target="_blank" class="btn-anexo">📎 Ver / Baixar Anexo</a>`
    }

    return `
      <div class="card">
        <h4>${materia.titulo}</h4>
        <p>${materia.descricao || 'Sem descrição'}</p>
        ${linkAnexo}

        <div class="card-actions">
          <label><strong>Status:</strong></label>
          <select onchange="window.alterarStatus('${materia.id}', this.value)" style="margin-bottom:0; width:auto;">
            <option value="a_fazer" ${materia.status === 'a_fazer' ? 'selected' : ''}>a_fazer</option>
            <option value="em_andamento" ${materia.status === 'em_andamento' ? 'selected' : ''}>em_andamento</option>
            <option value="concluido" ${materia.status === 'concluido' ? 'selected' : ''}>concluido</option>
          </select>

          <button class="btn-danger" onclick="window.excluirMateria('${materia.id}')">Excluir</button>
        </div>
      </div>
    `
  }).join('')
}

btnCriar.addEventListener('click', async () => {
  const titulo = tituloInput.value
  const descricao = descricaoInput.value
  const file = arquivoInput.files[0]

  if (!titulo) {
    alert('Por favor, insira o título da matéria.')
    return
  }

  let fileId = null

  if (file) {
    const up = await nhost.storage.uploadFiles({
      'bucket-id': 'default',
      'file[]': [file]
    })

    if (up.error) {
      alert('Erro ao enviar o ficheiro: ' + up.error.message)
      return
    }

    fileId = up.processedFiles?.[0]?.id || up.id
  }

  const res = await nhost.graphql.request({
    query: `mutation($titulo: String!, $descricao: String!, $file_id: uuid) {
      insert_materias_one(object: {titulo: $titulo, descricao: $descricao, file_id: $file_id}) {
        id
      }
    }`,
    variables: { titulo, descricao, file_id: fileId }
  })

  if (res.error) {
    console.error('Erro ao criar matéria:', res.error)
    alert('Erro ao criar matéria.')
  } else {
    tituloInput.value = ''
    descricaoInput.value = ''
    arquivoInput.value = ''
    carregarMaterias()
  }
})

window.alterarStatus = async (id, status) => {
  const res = await nhost.graphql.request({
    query: `mutation($id: uuid!, $status: String!) {
      update_materias_by_pk(pk_columns: {id: $id}, _set: {status: $status}) { id }
    }`,
    variables: { id, status }
  })

  if (res.error) {
    console.error('Erro ao atualizar status:', res.error)
    alert('Erro ao atualizar status.')
  } else {
    carregarMaterias()
  }
}

window.excluirMateria = async (id) => {
  if (!confirm('Tem a certeza que deseja excluir esta matéria?')) return

  const res = await nhost.graphql.request({
    query: `mutation($id: uuid!) { 
      delete_materias_by_pk(id: $id) { id } 
    }`,
    variables: { id }
  })

  if (res.error) {
    console.error('Erro ao excluir matéria:', res.error)
    alert('Erro ao excluir matéria.')
  } else {
    carregarMaterias()
  }
}

atualizarInterface()