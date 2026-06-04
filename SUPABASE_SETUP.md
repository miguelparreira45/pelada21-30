# Configurar Supabase no PeladaFast

## Por que usar Supabase

A versao atual salva dados no navegador. Com Supabase, os perfis, senhas, jogadores, temporadas e historico passam a ficar na nuvem, permitindo entrar pelo celular e computador com o mesmo login.

## Plano gratuito

O caminho recomendado e:

- Vercel Hobby para hospedar o site.
- Supabase Free para login, banco de dados e fotos dos jogadores.

## Passo a passo

1. Crie uma conta em https://supabase.com.
2. Crie um novo projeto.
3. Entre em **SQL Editor**.
4. Abra o arquivo `supabase/schema.sql` deste projeto.
5. Copie tudo e execute no SQL Editor.
6. Va em **Project Settings > API**.
7. Copie:
   - Project URL
   - Publishable key
8. Abra `supabase-config.js`.
9. Troque:

```js
url: "COLE_AQUI_A_URL_DO_SUPABASE",
anonKey: "COLE_AQUI_A_PUBLISHABLE_KEY_DO_SUPABASE"
```

pelos valores do seu projeto. Use a URL base, por exemplo `https://xxxx.supabase.co`, sem `/rest/v1/`.

10. Suba no GitHub/Vercel estes arquivos:

- `index.html`
- `app.css`
- `app.js`
- `supabase-config.js`
- `peladafast-logo.png`
- pasta `supabase/` apenas como referencia tecnica

## Observacao importante

A `anon public key` pode ficar no frontend. A seguranca real fica nas politicas RLS do banco, que garantem que cada usuario veja somente os proprios dados.

## Proxima etapa de codigo

Depois de preencher `supabase-config.js`, o proximo passo e trocar o armazenamento local do `app.js` pelas chamadas do Supabase:

- Auth: criar conta, login, logout e recuperar senha
- Database: temporadas, jogadores e peladas
- Storage: fotos de jogadores
