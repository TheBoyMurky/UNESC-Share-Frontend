<script setup lang="ts">
import type { Filters, SelectorKind } from './catalog-service'
import type { SelectorState } from './catalog-model'
type AcademicKey = Exclude<keyof Filters, 'q'>
defineProps<{ prefix: string; values: Pick<Filters, AcademicKey>; selectors: Record<SelectorKind, SelectorState>; required?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ change: [key: AcademicKey, value: string]; load: [kind: SelectorKind, append: boolean] }>()
const items: Array<{ kind: SelectorKind; key: AcademicKey; label: string; placeholder: string; parent?: AcademicKey }> = [
  { kind: 'instituicoes', key: 'instituicaoId', label: 'Instituição', placeholder: 'Todas as instituições' },
  { kind: 'cursos', key: 'cursoId', label: 'Curso', placeholder: 'Todos os cursos da instituição', parent: 'instituicaoId' },
  { kind: 'disciplinas', key: 'disciplinaId', label: 'Disciplina', placeholder: 'Todas as disciplinas do curso', parent: 'cursoId' },
  { kind: 'categorias', key: 'categoriaId', label: 'Categoria', placeholder: 'Todas as categorias' },
]
</script>

<template>
  <div class="catalog-filter-grid">
    <div v-for="item in items" :key="item.kind" class="catalog-field">
      <label :for="prefix + '-' + item.kind">{{ item.label }}</label>
      <select :id="prefix + '-' + item.kind" :value="values[item.key]" :required="required" :disabled="disabled || (!!item.parent && !values[item.parent])" :aria-busy="selectors[item.kind].loading" :aria-describedby="prefix + '-hint-' + item.kind" @change="emit('change', item.key, ($event.target as HTMLSelectElement).value)">
        <option value="">{{ item.parent && !values[item.parent] ? 'Selecione o vínculo anterior' : required ? 'Selecione ' + item.label.toLocaleLowerCase('pt-BR') : item.placeholder }}</option>
        <option v-for="option in selectors[item.kind].options" :key="option.id" :value="option.id">{{ option.complemento ? option.complemento + ' — ' : '' }}{{ option.nome }}</option>
      </select>
      <p :id="prefix + '-hint-' + item.kind" class="selector-hint" aria-live="polite">
        <template v-if="selectors[item.kind].loading">Carregando opções…</template>
        <template v-else-if="selectors[item.kind].error">{{ selectors[item.kind].error }}</template>
        <template v-else-if="selectors[item.kind].page && selectors[item.kind].options.length > selectors[item.kind].page!.totalElements">{{ selectors[item.kind].options.length }} opções em memória; a API informou {{ selectors[item.kind].page?.totalElements }} nesta consulta. As referências podem ter mudado.</template>
        <template v-else-if="selectors[item.kind].page">{{ selectors[item.kind].options.length }} de {{ selectors[item.kind].page?.totalElements }} opções carregadas.</template>
        <template v-else>{{ required ? 'Seleção obrigatória.' : 'Filtro opcional.' }}</template>
      </p>
      <button v-if="selectors[item.kind].error" class="button-link selector-more" type="button" :disabled="disabled || selectors[item.kind].loading" @click="emit('load', item.kind, selectors[item.kind].page !== null)">Tentar carregar opções novamente</button>
      <button v-else-if="selectors[item.kind].page && selectors[item.kind].page!.number + 1 < selectors[item.kind].page!.totalPages" class="button-link selector-more" type="button" :disabled="disabled || selectors[item.kind].loading" @click="emit('load', item.kind, true)">Carregar mais opções de {{ item.label.toLocaleLowerCase('pt-BR') }}</button>
    </div>
  </div>
</template>
