import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installAuthNavigation } from '../src/features/auth/navigation.ts'
import { createSession, SESSION_KEY } from '../src/features/auth/session.ts'
import { ApiError } from '../src/shared/http/client.ts'

function fixture(saved = false, failure = false, perfil = 'USUARIO') {
  let calls = 0
  const values = new Map()
  if (saved) values.set(SESSION_KEY, JSON.stringify({ accessToken: 'header.payload.signature', expiresAt: 2000000 }))
  const session = createSession({
    login: async () => ({ accessToken: 'header.payload.signature', expiresAt: 2000000 }),
    me: async () => { calls++; if (failure) throw new ApiError('network'); return { nome: 'Pessoa', perfil } },
  }, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }, () => 1000000)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', name: 'inicio', component: {} },
    { path: '/login', name: 'login', component: {} },
    { path: '/cadastro', name: 'cadastro', component: {} },
    { path: '/conta', name: 'conta', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais', name: 'catalogo', component: {}, meta: { requiresAuth: true } },
    { path: '/meus-materiais', name: 'meus-materiais', component: {}, meta: { requiresAuth: true } },
    { path: '/instituicoes', name: 'instituicoes', component: {}, meta: { requiresAuth: true } },
    { path: '/categorias', name: 'categorias', component: {}, meta: { requiresAuth: true } },
    { path: '/categorias/nova', name: 'categoria-cadastro', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id/editar', name: 'categoria-edicao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id/excluir', name: 'categoria-exclusao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id', name: 'categoria', component: {}, meta: { requiresAuth: true } },
    { path: '/instituicoes/nova', name: 'instituicao-cadastro', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id/editar', name: 'instituicao-edicao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id/excluir', name: 'instituicao-exclusao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id', name: 'instituicao', component: {}, meta: { requiresAuth: true } },
    { path: '/instituicoes/:id/cursos', name: 'instituicao-cursos', component: {}, meta: { requiresAuth: true } },
    { path: '/instituicoes/:id/cursos/novo', name: 'curso-cadastro', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:id/editar', name: 'curso-edicao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:id/excluir', name: 'curso-exclusao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas', name: 'curso-disciplinas', component: {}, meta: { requiresAuth: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/nova', name: 'disciplina-cadastro', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/editar', name: 'disciplina-edicao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/excluir', name: 'disciplina-exclusao', component: {}, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/minhas-denuncias', name: 'minhas-denuncias', component: {}, meta: { requiresAuth: true } },
    { path: '/moderacao/materiais', name: 'moderacao-materiais', component: {}, meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/denuncias', name: 'moderacao-denuncias', component: {}, meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/denuncias/:id', name: 'denuncia-revisao', component: {}, meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/materiais/:id', name: 'material-revisao', component: {}, meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/denuncias/:id', name: 'denuncia', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id/denunciar', name: 'denuncia-cadastro', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/novo', name: 'material-cadastro', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id/editar', name: 'material-edicao', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id/magnets/adicionar', name: 'material-magnet-adicao', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id/torrents/adicionar', name: 'material-torrent-adicao', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id/remover', name: 'material-remocao', component: {}, meta: { requiresAuth: true } },
    { path: '/materiais/:id', name: 'material', component: {}, meta: { requiresAuth: true } },
  ] })
  const dispose = installAuthNavigation(router, session)
  return { router, session, dispose, calls: () => calls }
}

test('rota protegida sem sessao redireciona para login', async () => {
  const f = fixture()
  try { await f.router.push('/conta'); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})

for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
  test('consulta de categorias permite ' + perfil + ' sem exigir perfil de equipe', async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/categorias'); assert.equal(f.router.currentRoute.value.name, 'categorias')
      await f.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'categoria')
    } finally { f.dispose() }
  })
}
test('consulta de categorias exige autenticação, sem conceder acesso anônimo por UUID', async () => {
  for (const saved of [false, true]) {
    const f = fixture(saved)
    try {
      await f.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee')
      assert.equal(f.router.currentRoute.value.name, saved ? 'categoria' : 'login')
    } finally { f.dispose() }
  }
})
test('cadastro de categoria exige ADMIN e preserva leitura para os demais perfis', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/categorias/nova'); assert.equal(f.router.currentRoute.value.name, 'conta'); assert.equal(f.router.currentRoute.value.query.acesso, 'administracao')
      await f.router.push('/categorias'); assert.equal(f.router.currentRoute.value.name, 'categorias')
    } finally { f.dispose() }
  }
  const admin = fixture(true, false, 'ADMINISTRADOR')
  try { await admin.router.push('/categorias/nova'); assert.equal(admin.router.currentRoute.value.name, 'categoria-cadastro'); admin.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(admin.router.currentRoute.value.name, 'login') }
  finally { admin.dispose() }
  const anonymous = fixture()
  try { await anonymous.router.push('/categorias/nova'); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
})
test('edição e exclusão de categoria exigem ADMIN, preservam consulta e tratam logout', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee/editar'); assert.equal(f.router.currentRoute.value.name, 'conta')
      await f.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee/excluir'); assert.equal(f.router.currentRoute.value.name, 'conta')
      await f.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'categoria')
    } finally { f.dispose() }
  }
  const admin = fixture(true, false, 'ADMINISTRADOR')
  try { await admin.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee/editar'); assert.equal(admin.router.currentRoute.value.name, 'categoria-edicao'); await admin.router.push('/categorias/665c3961-c1c9-48ce-a64b-51203042dcee/excluir'); assert.equal(admin.router.currentRoute.value.name, 'categoria-exclusao'); admin.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(admin.router.currentRoute.value.name, 'login') }
  finally { admin.dispose() }
})

for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('detalhe/historico da equipe permite ' + perfil + ' em rota separada do relato proprio', async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/moderacao/denuncias/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'denuncia-revisao')
      await f.router.push('/denuncias/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'denuncia')
    } finally { f.dispose() }
  })
}
test('detalhe/historico da equipe nao concede acesso porUUIDconhecido aanonimo/USUARIO', async () => {
  for (const saved of [false, true]) {
    const f = fixture(saved)
    try { await f.router.push('/moderacao/denuncias/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, saved ? 'conta' : 'login') }
    finally { f.dispose() }
  }
})

for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('fila denuncias permite equipe ' + perfil + ' e logout retira acesso sem abrir relatos proprios', async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/moderacao/denuncias'); assert.equal(f.router.currentRoute.value.name, 'moderacao-denuncias')
      f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login')
    } finally { f.dispose() }
  })
}
test('fila denuncias nega anonimo/USUARIO e preserva acompanhamento proprio', async () => {
  for (const saved of [false, true]) {
    const f = fixture(saved)
    try {
      await f.router.push('/moderacao/denuncias'); assert.equal(f.router.currentRoute.value.name, saved ? 'conta' : 'login')
      if (saved) { assert.equal(f.router.currentRoute.value.query.acesso, 'moderacao'); await f.router.push('/minhas-denuncias'); assert.equal(f.router.currentRoute.value.name, 'minhas-denuncias') }
    } finally { f.dispose() }
  }
})

for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('revisaoindividual permite equipe ' + perfil + ' em rota propria e preserva detalhe comum', async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/moderacao/materiais/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'material-revisao')
      await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'material')
    } finally { f.dispose() }
  })
}
test('revisaoindividual nao concede acesso aUSUARIO nem anonimo porconhecerUUID', async () => {
  for (const saved of [false, true]) {
    const f = fixture(saved)
    try { await f.router.push('/moderacao/materiais/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, saved ? 'conta' : 'login') }
    finally { f.dispose() }
  }
})

for (const perfil of ['MODERADOR', 'ADMINISTRADOR']) {
  test('fila de moderacao aceita perfil validado ' + perfil + ' e logout retira acesso', async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/moderacao/materiais'); assert.equal(f.router.currentRoute.value.name, 'moderacao-materiais'); assert.equal(f.calls(), 1)
      f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login')
    } finally { f.dispose() }
  })
}
for (const perfil of ['USUARIO', null, 'DESCONHECIDO']) {
  test('fila nao concede permissao por autenticacao com perfil ' + perfil, async () => {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/moderacao/materiais'); assert.equal(f.router.currentRoute.value.name, 'conta'); assert.equal(f.router.currentRoute.value.query.acesso, 'moderacao')
      await f.router.push('/meus-materiais'); assert.equal(f.router.currentRoute.value.name, 'meus-materiais')
    } finally { f.dispose() }
  })
}
test('fila anonima/acesso indisponivel exigem login sem conceder perfil nem repetir restauracao', async () => {
  for (const saved of [false, true]) {
    const f = fixture(saved, saved)
    try { await f.router.push('/moderacao/materiais'); assert.equal(f.router.currentRoute.value.name, 'login'); assert.equal(f.calls(), saved ? 1 : 0) }
    finally { f.dispose() }
  }
})
test('guarda observa perda de perfil na rota de equipe sem revogar token nem escrever na API', async () => {
  let state = { status: 'authenticated', user: { perfil: 'MODERADOR' } }
  const listeners = new Set()
  const session = { restore: async () => {}, getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/login', name: 'login', component: {} }, { path: '/conta', name: 'conta', component: {} },
    { path: '/moderacao/materiais', name: 'moderacao-materiais', component: {}, meta: { requiresAuth: true, requiresModeration: true } },
  ] })
  const dispose = installAuthNavigation(router, session)
  try {
    await router.push('/moderacao/materiais'); state = { status: 'authenticated', user: { perfil: 'USUARIO' } }; listeners.forEach(listener => listener(state))
    await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(router.currentRoute.value.name, 'conta'); assert.equal(state.status, 'authenticated')
  } finally { dispose() }
})

for (const [path, name] of [['/minhas-denuncias', 'minhas-denuncias'], ['/denuncias/665c3961-c1c9-48ce-a64b-51203042dcee', 'denuncia'], ['/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/denunciar', 'denuncia-cadastro']]) {
  test('denuncias: guarda protege ' + name + ' sem conceder autoria/permissao de Material', async () => {
    const anonymous = fixture(), authenticated = fixture(true)
    try {
      await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login')
      await authenticated.router.push(path); assert.equal(authenticated.router.currentRoute.value.name, name)
      authenticated.session.logout(); await new Promise(resolve => setTimeout(resolve, 0))
      assert.equal(authenticated.router.currentRoute.value.name, 'login')
    } finally { anonymous.dispose(); authenticated.dispose() }
  })
}

test('rota publica continua acessivel sem sessao', async () => {
  const f = fixture()
  try { await f.router.push('/'); assert.equal(f.router.currentRoute.value.name, 'inicio') }
  finally { f.dispose() }
})

test('confirmacao de remocao e protegida e guarda nao enviaDELETE nem concede autoria', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/remover')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/remover')
    assert.equal(authenticated.router.currentRoute.value.name, 'material-remocao')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('edicao exige acesso e guarda nao concede autoria ou permissao de estado', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/editar')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/editar')
    assert.equal(authenticated.router.currentRoute.value.name, 'material-edicao')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('adicaoMagnets anonimo exige login semconceder autoria', async () => {
  const f = fixture()
  try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/magnets/adicionar'); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})
test('adicaoMagnets rotaautenticada permite todosperfis masautoria e daAPI/modelo', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/magnets/adicionar'); assert.equal(f.router.currentRoute.value.name, 'material-magnet-adicao') }
    finally { f.dispose() }
  }
})
test('logout retira rotaadicaoMagnets', async () => {
  const f = fixture(true)
  try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/magnets/adicionar'); f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})

test('adicaoTorrent anonimo exige login semconceder autoria', async () => {
  const f = fixture()
  try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/torrents/adicionar'); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})
test('adicaoTorrent autenticada permite todosperfis, autoria/estado sao daAPI/modelo', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/torrents/adicionar'); assert.equal(f.router.currentRoute.value.name, 'material-torrent-adicao') }
    finally { f.dispose() }
  }
})
test('logout retira rotaadicaoTorrent', async () => {
  const f = fixture(true)
  try { await f.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee/torrents/adicionar'); f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})

test('instituicoes lista/detalhe exigemlogin', async () => {
  const f = fixture()
  try { for (const path of ['/instituicoes', '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee']) { await f.router.push(path); assert.equal(f.router.currentRoute.value.name, 'login') } }
  finally { f.dispose() }
})
test('instituicoes leitura permitida aUSUARIO-MODERADOR-ADMINISTRADOR', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try { await f.router.push('/instituicoes'); assert.equal(f.router.currentRoute.value.name, 'instituicoes'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee'); assert.equal(f.router.currentRoute.value.name, 'instituicao') }
    finally { f.dispose() }
  }
})
test('logoutretira consultas deinstituicoes semexcecaodeperfil', async () => {
  const f = fixture(true, false, 'ADMINISTRADOR')
  try { await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee'); f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})

test('cadastroInstituicao anonimo vai login sem confundir nova comUUID', async () => {
  const f = fixture()
  try { await f.router.push('/instituicoes/nova'); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})
for (const perfil of ['USUARIO', 'MODERADOR']) {
  test('cadastroInstituicao nega ' + perfil + ' mas preservaconsulta/lista-contaautenticada', async () => {
    const f = fixture(true, false, perfil)
    try { await f.router.push('/instituicoes/nova'); assert.equal(f.router.currentRoute.value.name, 'conta'); assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); assert.equal(f.session.getState().status, 'authenticated'); await f.router.push('/instituicoes'); assert.equal(f.router.currentRoute.value.name, 'instituicoes') }
    finally { f.dispose() }
  })
}
test('cadastroInstituicao ADMINISTRADOR entra/logoutretira', async () => {
  const f = fixture(true, false, 'ADMINISTRADOR')
  try { await f.router.push('/instituicoes/nova'); assert.equal(f.router.currentRoute.value.name, 'instituicao-cadastro'); f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login') }
  finally { f.dispose() }
})
test('edicaoInstituicao exigeADMIN, preserva leitura para demais perfis e trata logout', async () => {
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/editar')
      assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'instituicao-edicao' : 'conta')
      if (perfil === 'ADMINISTRADOR') { f.session.logout(); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(f.router.currentRoute.value.name, 'login') }
      else { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes'); assert.equal(f.router.currentRoute.value.name, 'instituicoes') }
    } finally { f.dispose() }
  }
})
test('exclusaoInstituicao exigeADMIN e preserva leitura de instituicoes para os demais perfis', async () => {
  const anonymous = fixture(false)
  try { await anonymous.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/excluir'); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/excluir')
      assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'instituicao-exclusao' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes'); assert.equal(f.router.currentRoute.value.name, 'instituicoes') }
    } finally { f.dispose() }
  }
})
test('consultaCursosInstituicao exige login e leitura permanece para os tres perfis', async () => {
  const anonymous = fixture(false)
  try { await anonymous.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos'); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try { await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos'); assert.equal(f.router.currentRoute.value.name, 'instituicao-cursos') }
    finally { f.dispose() }
  }
})
test('cadastroCurso exige ADMIN e mantém leitura de cursos para os outros perfis', async () => {
  const anonymous = fixture(false)
  try { await anonymous.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/novo'); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/novo')
      assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'curso-cadastro' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos'); assert.equal(f.router.currentRoute.value.name, 'instituicao-cursos') }
    } finally { f.dispose() }
  }
})
test('edicaoCurso exige ADMIN e preserva consulta para os demais perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/editar'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push(path); assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'curso-edicao' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos'); assert.equal(f.router.currentRoute.value.name, 'instituicao-cursos') }
    } finally { f.dispose() }
  }
})
test('exclusaoCurso exige ADMIN sem remover a consulta dos outros perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/excluir'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push(path); assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'curso-exclusao' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos'); assert.equal(f.router.currentRoute.value.name, 'instituicao-cursos') }
    } finally { f.dispose() }
  }
})
test('consultaDisciplinas exige login e permite leitura aos tres perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try { await f.router.push(path); assert.equal(f.router.currentRoute.value.name, 'curso-disciplinas') }
    finally { f.dispose() }
  }
})
test('cadastroDisciplina exige ADMINISTRADOR e preserva consulta para os outros perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas/nova'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push(path); assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'disciplina-cadastro' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas'); assert.equal(f.router.currentRoute.value.name, 'curso-disciplinas') }
    } finally { f.dispose() }
  }
})
test('edicaoDisciplina exige ADMINISTRADOR e preserva consulta para os outros perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas/865c3961-c1c9-48ce-a64b-51203042dcee/editar'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push(path); assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'disciplina-edicao' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas'); assert.equal(f.router.currentRoute.value.name, 'curso-disciplinas') }
    } finally { f.dispose() }
  }
})
test('exclusaoDisciplina exige ADMINISTRADOR e preserva consulta para os outros perfis', async () => {
  const path = '/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas/865c3961-c1c9-48ce-a64b-51203042dcee/excluir'
  const anonymous = fixture(false)
  try { await anonymous.router.push(path); assert.equal(anonymous.router.currentRoute.value.name, 'login') }
  finally { anonymous.dispose() }
  for (const perfil of ['USUARIO', 'MODERADOR', 'ADMINISTRADOR']) {
    const f = fixture(true, false, perfil)
    try {
      await f.router.push(path); assert.equal(f.router.currentRoute.value.name, perfil === 'ADMINISTRADOR' ? 'disciplina-exclusao' : 'conta')
      if (perfil !== 'ADMINISTRADOR') { assert.equal(f.router.currentRoute.value.query.acesso, 'administracao'); await f.router.push('/instituicoes/665c3961-c1c9-48ce-a64b-51203042dcee/cursos/765c3961-c1c9-48ce-a64b-51203042dcee/disciplinas'); assert.equal(f.router.currentRoute.value.name, 'curso-disciplinas') }
    } finally { f.dispose() }
  }
})
test('requiresAdmin implicaautenticacao e guardareageaperdadeperfilobservada semdeslogar', async () => {
  let state = { status: 'anonymous', user: null }
  const listeners = new Set(), session = { restore: async () => {}, getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/login', name: 'login', component: {} }, { path: '/conta', name: 'conta', component: {} }, { path: '/instituicoes/nova', name: 'instituicao-cadastro', component: {}, meta: { requiresAdmin: true } }] })
  const dispose = installAuthNavigation(router, session)
  try {
    await router.push('/instituicoes/nova'); assert.equal(router.currentRoute.value.name, 'login')
    state = { status: 'authenticated', user: { perfil: 'ADMINISTRADOR' } }; await router.push('/instituicoes/nova'); assert.equal(router.currentRoute.value.name, 'instituicao-cadastro')
    state = { status: 'authenticated', user: { perfil: 'MODERADOR' } }; listeners.forEach(listener => listener(state)); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(router.currentRoute.value.name, 'conta'); assert.equal(router.currentRoute.value.query.acesso, 'administracao'); assert.equal(state.status, 'authenticated')
  } finally { dispose() }
})

test('catalogo tambem exige sessao validada', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/materiais')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/materiais')
    assert.equal(authenticated.router.currentRoute.value.name, 'catalogo')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('meus materiais exige acesso e nao interfere com rota de detalhes por UUID', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/meus-materiais')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/meus-materiais')
    assert.equal(authenticated.router.currentRoute.value.name, 'meus-materiais')
    await authenticated.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee')
    assert.equal(authenticated.router.currentRoute.value.name, 'material')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('cadastroMaterial e protegido e rota novo nao e confundida com UUID de detalhe', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/materiais/novo')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/materiais/novo')
    assert.equal(authenticated.router.currentRoute.value.name, 'material-cadastro')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('logout em meus materiais redireciona para login', { timeout: 2000 }, async () => {
  const f = fixture(true)
  try {
    await f.router.push('/meus-materiais')
    const redirected = new Promise(resolve => { const remove = f.router.afterEach(() => { remove(); resolve() }) })
    f.session.logout()
    await redirected
    assert.equal(f.router.currentRoute.value.name, 'login')
  } finally { f.dispose() }
})

test('detalhe tambem exige sessao; guarda nao decide visibilidade pelo perfil local', async () => {
  const anonymous = fixture(), authenticated = fixture(true)
  try {
    await anonymous.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee')
    assert.equal(anonymous.router.currentRoute.value.name, 'login')
    await authenticated.router.push('/materiais/665c3961-c1c9-48ce-a64b-51203042dcee')
    assert.equal(authenticated.router.currentRoute.value.name, 'material')
  } finally { anonymous.dispose(); authenticated.dispose() }
})

test('logout no catalogo redireciona para login', { timeout: 2000 }, async () => {
  const f = fixture(true)
  try {
    await f.router.push('/materiais')
    const redirected = new Promise(resolve => { const remove = f.router.afterEach(() => { remove(); resolve() }) })
    f.session.logout()
    await redirected
    assert.equal(f.router.currentRoute.value.name, 'login')
  } finally { f.dispose() }
})

test('guarda aguarda restauracao e libera conta somente apos me', async () => {
  const f = fixture(true)
  try { await f.router.push('/conta'); assert.equal(f.router.currentRoute.value.name, 'conta'); assert.equal(f.session.getState().status, 'authenticated') }
  finally { f.dispose() }
})

test('login com sessao validada redireciona para conta', async () => {
  const f = fixture(true)
  try { await f.router.push('/login'); assert.equal(f.router.currentRoute.value.name, 'conta') }
  finally { f.dispose() }
})

test('cadastro e publico para visitante sem liberar rotas protegidas', async () => {
  const f = fixture()
  try {
    await f.router.push('/cadastro')
    assert.equal(f.router.currentRoute.value.name, 'cadastro')
    assert.equal(f.session.getState().status, 'anonymous')
    await f.router.push('/materiais')
    assert.equal(f.router.currentRoute.value.name, 'login')
  } finally { f.dispose() }
})

test('cadastro com acesso ja validado redireciona para conta', async () => {
  const f = fixture(true)
  try { await f.router.push('/cadastro'); assert.equal(f.router.currentRoute.value.name, 'conta') }
  finally { f.dispose() }
})

test('cadastro permanece publico se validacao do acesso salvo estiver indisponivel', async () => {
  const f = fixture(true, true)
  try {
    await f.router.push('/cadastro')
    assert.equal(f.router.currentRoute.value.name, 'cadastro')
    assert.equal(f.session.getState().status, 'unavailable')
    assert.equal(f.calls(), 1)
  } finally { f.dispose() }
})

test('falha de rede na restauracao nao libera rota protegida', async () => {
  const f = fixture(true, true)
  try { await f.router.push('/conta'); assert.equal(f.router.currentRoute.value.name, 'login'); assert.equal(f.session.getState().status, 'unavailable'); assert.equal(f.calls(), 1) }
  finally { f.dispose() }
})

test('logout na conta navega para login sem restaurar o usuario', { timeout: 2000 }, async () => {
  const f = fixture(true)
  try {
    await f.router.push('/conta')
    const redirected = new Promise(resolve => {
      const remove = f.router.afterEach(() => { remove(); resolve() })
    })
    f.session.logout()
    await redirected
    assert.equal(f.router.currentRoute.value.name, 'login')
    assert.equal(f.session.getState().status, 'anonymous')
  } finally { f.dispose() }
})
