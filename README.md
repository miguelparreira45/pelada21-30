# PeladaFast

Sistema para controlar perfis de peladas, partidas, placares e rankings.

## O que faz

- cria perfis por pelada
- salva usuarios e senhas no navegador
- recupera senha por codigo de 4 digitos via WhatsApp
- cadastra jogadores por time
- sorteia a primeira partida
- inicia a contagem de 7 minutos manualmente
- registra gols e assistencias por jogador
- encerra a partida com 2 gols ou quando o tempo acaba
- inicia a proxima partida entre vencedor e time de fora
- salva historico de peladas finalizadas
- mostra rankings gerais de gols, assistencias e pe quente
- gera relatorio final para WhatsApp

## Como usar

Abra `index.html` no navegador.

## Uso em varios aparelhos

A versao local salva dados no proprio navegador. Para entrar pelo celular e computador com o mesmo usuario, configure Supabase seguindo o arquivo `SUPABASE_SETUP.md`.

O Supabase sera usado para:

- login e cadastro
- banco de dados de perfis, temporadas, jogadores e peladas
- fotos de jogadores
- recuperacao de senha
