import { detail, id, magnetUri } from './material-fixtures.mjs'
export { id, magnetUri }
export const input = () => ({ titulo: 'Título sintético', descricao: 'Descrição sintética', disciplinaId: id(5), categoriaId: id(7), magnetUris: [magnetUri] })
export const created = () => ({ ...detail(), status: 'PENDENTE', torrents: [] })
export async function prepare(model) {
  await model.initialize()
  await model.changeAcademic('instituicaoId', id(1)); await model.changeAcademic('cursoId', id(3))
  await model.changeAcademic('disciplinaId', id(5)); await model.changeAcademic('categoriaId', id(7))
  model.changeText('titulo', input().titulo); model.changeText('descricao', input().descricao); model.changeMagnet(0, magnetUri)
}
