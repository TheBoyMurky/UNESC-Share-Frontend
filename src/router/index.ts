import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '@/features/inicio/InicioView.vue'
import { auth } from '@/features/auth/auth'
import { installAuthNavigation } from '@/features/auth/navigation'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'inicio', component: InicioView },
    { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue') },
    { path: '/cadastro', name: 'cadastro', component: () => import('@/features/auth/CadastroView.vue') },
    { path: '/conta', name: 'conta', component: () => import('@/features/auth/ContaView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais', name: 'catalogo', component: () => import('@/features/catalogo/CatalogoView.vue'), meta: { requiresAuth: true } },
    { path: '/meus-materiais', name: 'meus-materiais', component: () => import('@/features/material/MeusMateriaisView.vue'), meta: { requiresAuth: true } },
    { path: '/instituicoes', name: 'instituicoes', component: () => import('@/features/instituicao/InstituicoesView.vue'), meta: { requiresAuth: true } },
    { path: '/categorias', name: 'categorias', component: () => import('@/features/categoria/CategoriasView.vue'), meta: { requiresAuth: true } },
    { path: '/categorias/nova', name: 'categoria-cadastro', component: () => import('@/features/categoria/CategoriaCadastroView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id/editar', name: 'categoria-edicao', component: () => import('@/features/categoria/CategoriaEdicaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id/excluir', name: 'categoria-exclusao', component: () => import('@/features/categoria/CategoriaExclusaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/categorias/:id', name: 'categoria', component: () => import('@/features/categoria/CategoriaView.vue'), meta: { requiresAuth: true } },
    { path: '/instituicoes/nova', name: 'instituicao-cadastro', component: () => import('@/features/instituicao/InstituicaoCadastroView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id/editar', name: 'instituicao-edicao', component: () => import('@/features/instituicao/InstituicaoEdicaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id/excluir', name: 'instituicao-exclusao', component: () => import('@/features/instituicao/InstituicaoExclusaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:id/cursos/novo', name: 'curso-cadastro', component: () => import('@/features/curso/CursoCadastroView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:id/editar', name: 'curso-edicao', component: () => import('@/features/curso/CursoEdicaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:id/excluir', name: 'curso-exclusao', component: () => import('@/features/curso/CursoExclusaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/nova', name: 'disciplina-cadastro', component: () => import('@/features/disciplina/DisciplinaCadastroView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/editar', name: 'disciplina-edicao', component: () => import('@/features/disciplina/DisciplinaEdicaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas/:disciplinaId/excluir', name: 'disciplina-exclusao', component: () => import('@/features/disciplina/DisciplinaExclusaoView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas', name: 'curso-disciplinas', component: () => import('@/features/disciplina/DisciplinasCursoView.vue'), meta: { requiresAuth: true } },
    { path: '/instituicoes/:id', name: 'instituicao', component: () => import('@/features/instituicao/InstituicaoView.vue'), meta: { requiresAuth: true } },
    { path: '/instituicoes/:id/cursos', name: 'instituicao-cursos', component: () => import('@/features/curso/CursosInstituicaoView.vue'), meta: { requiresAuth: true } },
    { path: '/minhas-denuncias', name: 'minhas-denuncias', component: () => import('@/features/denuncia/MinhasDenunciasView.vue'), meta: { requiresAuth: true } },
    { path: '/moderacao/materiais', name: 'moderacao-materiais', component: () => import('@/features/moderacao/MateriaisPendentesView.vue'), meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/denuncias', name: 'moderacao-denuncias', component: () => import('@/features/moderacao/DenunciasEquipeView.vue'), meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/denuncias/:id', name: 'denuncia-revisao', component: () => import('@/features/moderacao/DenunciaEquipeView.vue'), meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/moderacao/materiais/:id', name: 'material-revisao', component: () => import('@/features/moderacao/MaterialRevisaoView.vue'), meta: { requiresAuth: true, requiresModeration: true } },
    { path: '/denuncias/:id', name: 'denuncia', component: () => import('@/features/denuncia/DenunciaView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/novo', name: 'material-cadastro', component: () => import('@/features/material/MaterialCadastroView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id/editar', name: 'material-edicao', component: () => import('@/features/material/MaterialEdicaoView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id/magnets/adicionar', name: 'material-magnet-adicao', component: () => import('@/features/material/MaterialMagnetAdicaoView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id/torrents/adicionar', name: 'material-torrent-adicao', component: () => import('@/features/material/MaterialTorrentAdicaoView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id/remover', name: 'material-remocao', component: () => import('@/features/material/MaterialRemocaoView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id/denunciar', name: 'denuncia-cadastro', component: () => import('@/features/denuncia/DenunciaCadastroView.vue'), meta: { requiresAuth: true } },
    { path: '/materiais/:id', name: 'material', component: () => import('@/features/material/MaterialView.vue'), meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', name: 'nao-encontrado', component: () => import('@/shared/NotFoundView.vue') },
  ],
  scrollBehavior(to) { return to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 } },
})

installAuthNavigation(router, auth)
