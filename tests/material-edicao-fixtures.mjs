import { detail, id } from './material-fixtures.mjs'
export { detail, id }
export const metadata = () => ({ titulo: 'Título revisado', descricao: 'Descrição revisada', disciplinaId: id(5), categoriaId: id(7) })
export const references = () => ({ values: { instituicaoId: id(1), cursoId: id(3), disciplinaId: id(5), categoriaId: id(7) }, options: {
  instituicoes: { id: id(1), nome: 'Instituição', complemento: 'TESTE' }, cursos: { id: id(3), nome: 'Curso' },
  disciplinas: { id: id(5), nome: 'Disciplina', complemento: 'CODIGO' }, categorias: { id: id(7), nome: 'Categoria' },
} })
export const referenceDTOs = () => ({ ['/disciplinas/' + id(5)]: { id: id(5), nome: 'Disciplina', codigo: 'CODIGO', cursoId: id(3) },
  ['/categorias/' + id(7)]: { id: id(7), nome: 'Categoria' }, ['/cursos/' + id(3)]: { id: id(3), nome: 'Curso', instituicaoId: id(1) }, ['/instituicoes/' + id(1)]: { id: id(1), nome: 'Instituição', sigla: 'TESTE' } })
