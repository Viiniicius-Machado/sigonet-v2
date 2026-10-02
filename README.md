# SigoNet V2

Sistema Integrado de Gestão Operacional da Netturbo (Field Desk).

Site: https://viiniicius-machado.github.io/sigonet-v2/

É um aplicativo web (HTML, CSS e JavaScript puro, sem framework) com dois públicos:
- a **liderança**, no computador;
- os **técnicos** dos prestadores, no celular.

Os dados ficam numa planilha Google, e um servidor em Google Apps Script faz a ponte com o site. Nomes, CNPJs e budgets **não** ficam neste repositório: vêm da planilha, depois do login.

## Módulos

| Área | O que faz |
|---|---|
| **Chamados (NOC)** | Abertura da OS, classificação pela matriz oficial (SLA e conta contábil), despacho, linha do tempo (MTTD, MTTA, MTTR, SLA), RFO, anexos e PDF do atendimento. |
| **App do técnico** | Fila de OS, aceite, deslocamento, chegada com GPS, fotos com carimbo (estilo Timemark, com a logo oficial Net Turbo) e conclusão técnica. Toque na foto abre em tela cheia, com zoom para ler o carimbo. Tem também a LPU, os materiais e a fibra do atendimento. |
| **Gestão de LPU** | Conferência e aprovação dos itens que o prestador cobra, por conta contábil e budget. |
| **Service Desk, Materiais e Cadastro de Fibra** | Gestões ligadas ao chamado, cada uma com seu ciclo; elas não mexem no MTTR/SLA. |
| **Portal de Gestão** | KPIs do mês nas visões **Global, Rompimento, Massiva e Improdutivas**, com MTTD, MTTA, MTTR, SLA e **IRR** (reincidência por circuito). Exporta para Excel. |
| **Preventiva** | Rotas de preventiva **aérea** (KMZ, metros percorridos, postes, cordoalha, plaquetas, caixas e sobra técnica; meta mensal) e **subterrânea** (vistoria caixa a caixa, com fotos padronizadas e listas fechadas). Telas: Planejamento, Revisão e Dashboard, mais o app do técnico, que funciona offline. A cobrança sai pelo fluxo normal de chamado e LPU. O manual completo (`docs/PREVENTIVA.md`) fica na pasta de trabalho. |
| **Cadastros e Acessos, Auditoria** | Empresas, técnicos, liderança e telas liberadas por pessoa; log de tudo o que foi alterado. Em *Sistema*, o gestor com acesso total pode **apagar os dados de teste** (veja abaixo). |

## Preventiva: como criar as atividades

1. **Pela Preventiva:** Menu **Preventiva → Planejamento → Nova rota**. Escolha *Aérea* ou *Subterrânea*, preencha e clique em **Salvar e despachar**. O chamado Preventiva é criado sozinho e entra na fila do técnico.
   Use **Data-limite** quando a rota levar mais de um dia (em branco = o próprio dia planejado).
2. **A partir de uma OS aberta no NOC:** no chamado do tipo Preventiva, clique em **🧭 Transformar em rota de Preventiva**. A rota fica ligada ao mesmo chamado, sem abrir outro.

Só o que foi **aprovado na Revisão** entra na medição e no pagamento.

**Prazo da atividade planejada:** o chamado da Preventiva não segue o SLA em horas da matriz. O prazo é o fim do dia da data-limite da rota, e o SLA é "concluída até a data". Por ser planejada, a Preventiva fica fora das médias de MTTD, MTTA e MTTR do Portal (que medem a corretiva); conta o tempo em campo.

## Acesso

- Entrada com **nome, PIN e complemento pessoal**. O PIN é dado pela gestão e pode ter letras e números (maiúsculas e minúsculas valem igual).
- O complemento é criado pela própria pessoa no 1º acesso; a gestão só consegue resetar.
- Cinco tentativas erradas bloqueiam o acesso por 15 minutos.

## Uso no dia a dia

- **Botões:** toda ação que busca ou grava no servidor mostra que está carregando (o botão gira e fica travado, sem clique duplo). Se passar de ~1 s, aparece o foguete "Carregando…" no rodapé.
- **Fotos:** toque na miniatura abre em tela cheia; outro toque amplia no ponto tocado; deslize ou use ‹ › para passar; "voltar" fecha.
- **Sem sinal:** o técnico continua trabalhando; fotos, CS e apontamentos ficam no celular e sobem quando o sinal voltar.

## Apagar os dados de teste

Em **Cadastros e Acessos → Sistema → Apagar dados de teste** (só gestor com acesso total, digitando *APAGAR TUDO*):

- **Apaga:** chamados, LPUs, materiais, fibra, pagamentos, fechamentos, disponibilidade e as rotas, vistorias e apontamentos da Preventiva. A numeração recomeça (CH-00001, ROT-00001…).
- **Mantém:** cadastros e acessos, base de CS, configurações, histórico da Preventiva importado da planilha de KPIs, log e arquivos no Drive.
- Os aparelhos abertos descartam sozinhos o que tinham guardado dos testes. Não dá para desfazer: baixe a cópia (.json) antes, se quiser guardar.

## Estrutura

```
index.html        tela única (roteamento por #hash)
css/sigonet.css   tema
js/nucleo.js      base comum (SN): rotas, modais, banco local, sessão
js/servidor.js    sincronização com o Apps Script
js/telas-*.js     telas de cada módulo
js/vistoria-*.js  Preventiva: listas, regras (compartilhadas com o servidor), fila offline, câmera, PDF
js/catalogos.js   matriz de classificação e catálogo de LPU
js/dados.js       versão pública (sem pessoas, CNPJs nem budgets)
```

Este repositório recebe só a parte pública (o site). O código do servidor (Apps Script), os testes e as ferramentas ficam fora dele.

## Publicação

O conteúdo deste repositório é gerado por `node ferramentas/publicar.mjs` a partir da pasta de trabalho. O script troca o `dados.js` pela versão pública e para se algum dado sensível ficar no pacote. Não edite os arquivos daqui à mão. Depois do push, o GitHub Pages atualiza em 1 a 2 minutos.
