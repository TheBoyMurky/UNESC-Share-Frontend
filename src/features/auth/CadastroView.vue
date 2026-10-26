<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef } from 'vue'
import { cadastroService } from './auth'
import { createCadastroModel } from './cadastro-model'

const model = createCadastroModel(cadastroService)
const state = shallowRef(model.getState())
const unsubscribe = model.subscribe(value => { state.value = value })
const nome = ref(''), email = ref(''), senha = ref(''), confirmacao = ref('')
const feedback = ref<HTMLElement | null>(null)
let mounted = true
async function submit() {
  const pending = model.submit({ nome: nome.value, email: email.value, senha: senha.value, confirmacao: confirmacao.value })
  // Limpar assim que o POST for iniciado; erros locais permitem corrigir o formulario.
  if (state.value.sending) { senha.value = ''; confirmacao.value = '' }
  await pending
  if (!mounted) return
  if (state.value.succeeded) { nome.value = ''; email.value = '' }
  await nextTick()
  feedback.value?.focus()
}
onBeforeUnmount(() => {
  mounted = false; senha.value = ''; confirmacao.value = ''; nome.value = ''; email.value = ''
  unsubscribe(); model.dispose()
})
</script>

<template>
  <section class="auth-layout container" aria-labelledby="cadastro-title">
    <div class="auth-intro">
      <p class="eyebrow">Faça parte da troca</p>
      <h1 id="cadastro-title">Aprender fica melhor<br>quando é <em>compartilhado.</em></h1>
      <p class="hero-description">Crie sua conta para explorar o catálogo acadêmico. O UnescShare organiza os materiais; o compartilhamento acontece pela rede BitTorrent.</p>
      <p class="responsibility">Compartilhe somente conteúdos autorizados. Esta plataforma não hospeda PDFs, vídeos ou outros arquivos acadêmicos.</p>
    </div>
    <div v-if="state.succeeded" class="auth-card cadastro-success">
      <p class="eyebrow">Tudo pronto para começar</p>
      <h2 ref="feedback" tabindex="-1">Conta criada</h2>
      <p role="status" class="form-description">Seu cadastro foi concluído. Entre com o e-mail e a senha escolhidos para acessar o catálogo.</p>
      <RouterLink class="button-primary" to="/login">Ir para o login <span aria-hidden="true">→</span></RouterLink>
      <p class="form-footnote">Nenhum acesso foi iniciado automaticamente.</p>
    </div>
    <form v-else class="auth-card" @submit.prevent="submit" :aria-busy="state.sending">
      <p class="eyebrow">UnescShare</p><h2>Criar uma conta</h2>
      <p class="form-description">Preencha seus dados. Depois do cadastro, você fará o login. Se houver falha no envio, digite novamente a senha e a confirmação.</p>
      <div v-if="state.error" ref="feedback" class="form-alert" role="alert" tabindex="-1"><p>{{ state.error }}</p></div>
      <fieldset :disabled="state.sending">
        <label for="cadastro-nome">Nome</label>
        <input id="cadastro-nome" v-model="nome" name="nome" autocomplete="name" maxlength="120" required :aria-invalid="!!state.fields.nome" :aria-describedby="state.fields.nome ? 'cadastro-nome-error' : undefined">
        <p v-if="state.fields.nome" id="cadastro-nome-error" class="field-error">{{ state.fields.nome }}</p>
        <label for="cadastro-email">E-mail</label>
        <input id="cadastro-email" v-model="email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="254" required :aria-invalid="!!state.fields.email" :aria-describedby="state.fields.email ? 'cadastro-email-error' : undefined">
        <p v-if="state.fields.email" id="cadastro-email-error" class="field-error">{{ state.fields.email }}</p>
        <label for="cadastro-senha">Senha</label>
        <input id="cadastro-senha" v-model="senha" name="senha" type="password" autocomplete="new-password" minlength="8" maxlength="64" required :aria-invalid="!!state.fields.senha" :aria-describedby="state.fields.senha ? 'cadastro-password-help cadastro-senha-error' : 'cadastro-password-help'">
        <p id="cadastro-password-help" class="form-footnote">Use de 8 a 64 caracteres, com até 72 bytes em UTF-8. Acentos e emojis podem ocupar mais de um byte. Espaços na senha são preservados.</p>
        <p v-if="state.fields.senha" id="cadastro-senha-error" class="field-error">{{ state.fields.senha }}</p>
        <label for="cadastro-confirmacao">Confirmar senha</label>
        <input id="cadastro-confirmacao" v-model="confirmacao" name="confirmacao" type="password" autocomplete="new-password" minlength="8" maxlength="64" required :aria-invalid="!!state.fields.confirmacao" :aria-describedby="state.fields.confirmacao ? 'cadastro-confirmacao-error' : undefined">
        <p v-if="state.fields.confirmacao" id="cadastro-confirmacao-error" class="field-error">{{ state.fields.confirmacao }}</p>
        <button class="button-primary auth-submit" type="submit">{{ state.sending ? 'Enviando cadastro…' : 'Criar conta' }} <span aria-hidden="true">→</span></button>
      </fieldset>
      <p class="form-footnote">Já tem uma conta? <RouterLink to="/login">Entrar</RouterLink>. Não há login automático nem recuperação de senha nesta entrega.</p>
    </form>
  </section>
</template>
