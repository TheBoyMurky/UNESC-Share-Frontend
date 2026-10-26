# Consulta de disciplinas no frontend

## O que foi implementado

A lista de cursos ganhou o link **Ver disciplinas**, disponível para qualquer perfil autenticado. A rota `/instituicoes/:instituicaoId/cursos/:cursoId/disciplinas` consulta os dados da instituição e do curso, confirma que o curso pertence à instituição da rota e então lista as disciplinas daquele curso.

A consulta usa `GET /disciplinas?cursoId={uuid}&page={n}&size={n}`. A paginação oferece 20, 50 ou 100 itens. Cada item exibe nome, código e descrição somente quando a API fornece descrição. Erros, lista vazia e carregamento são estados separados.

## Arquivos

- `src/features/disciplina/disciplina-service.ts`: chamada REST, validação e projeção do DTO.
- `src/features/disciplina/disciplina-consulta-model.ts`: contexto da tela, carregamento, paginação, cancelamento e descarte de respostas antigas.
- `src/features/disciplina/DisciplinasCursoView.vue`: tela de consulta.
- `src/features/curso/curso-service.ts`: método `detail` para validar o curso da rota.
- `src/features/curso/CursosInstituicaoView.vue`: link de consulta junto a cada curso.
- `src/router/index.ts`: rota protegida por autenticação.
- `tests/disciplina-consulta.test.mjs`, `tests/disciplina-consulta-http.test.mjs` e `tests/auth-navigation.test.mjs`: contrato/modelo, HTTP e guarda.

O backend continua como autoridade dos dados e das permissões. A tela não realiza escrita, não busca nomes disciplina por disciplina e não inventa ementas ou outros atributos da matriz curricular. `ADMINISTRADOR` ainda não tem ações de criação, edição ou exclusão nesta entrega. O contrato backend está em `../UNESC-Share-Backend/docs/DISCIPLINAS.md`.

## Como executar e verificar

Com frontend e backend iniciados, entre com uma conta, abra **Instituições**, selecione uma instituição e depois **Cursos**. Em um curso, escolha **Ver disciplinas**. A API precisa estar acessível no `VITE_API_BASE_URL` configurado no frontend.

Para executar testes e build:

```bash
npm run verify
```

O teste HTTP automatizado usa servidor local sintético; não substitui integração visual com Spring/PostgreSQL. A tela passou por checagem TypeScript/build, mas inspeção visual, acessibilidade no DOM e E2E no navegador seguem pendentes.
