import type { Router } from 'vue-router'
import type { createSession } from './session.ts'
import { canAdminister, canModerate } from './permissions.ts'

export function installAuthNavigation(router: Router, session: ReturnType<typeof createSession>) {
  const removeGuard = router.beforeEach(async to => {
    // Falha de rede exige tentativa explicita, nao nova chamada a cada redirecionamento.
    if (session.getState().status !== 'unavailable') await session.restore()
    const state = session.getState()
    if ((to.meta.requiresAuth || to.meta.requiresModeration || to.meta.requiresAdmin) && state.status !== 'authenticated') return { name: 'login' }
    if (to.meta.requiresAdmin && !canAdminister(state.user)) return { name: 'conta', query: { acesso: 'administracao' } }
    if (to.meta.requiresModeration && !canModerate(state.user)) return { name: 'conta', query: { acesso: 'moderacao' } }
    if ((to.name === 'login' || to.name === 'cadastro') && state.status === 'authenticated') return { name: 'conta' }
  })
  const unsubscribe = session.subscribe(state => {
    if (state.status === 'anonymous' && (router.currentRoute.value.meta.requiresAuth || router.currentRoute.value.meta.requiresModeration || router.currentRoute.value.meta.requiresAdmin)) {
      void router.replace({ name: 'login' })
    } else if (state.status === 'authenticated' && router.currentRoute.value.meta.requiresAdmin && !canAdminister(state.user)) {
      void router.replace({ name: 'conta', query: { acesso: 'administracao' } })
    } else if (state.status === 'authenticated' && router.currentRoute.value.meta.requiresModeration && !canModerate(state.user)) {
      void router.replace({ name: 'conta', query: { acesso: 'moderacao' } })
    }
  })
  return () => { removeGuard(); unsubscribe() }
}
