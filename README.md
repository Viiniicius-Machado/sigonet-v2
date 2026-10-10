# SigoNet V2

Sistema Integrado de Gestão Operacional da Netturbo (Field Desk).

Site: https://viiniicius-machado.github.io/sigonet-v2/

É um aplicativo web (HTML, CSS e JavaScript puro, sem framework) com dois públicos:
- a **liderança**, no computador;
- os **técnicos** dos prestadores, no celular. O site pode ser **instalado como aplicativo** (Android: "Instalar app"; iPhone: Compartilhar → "Adicionar à Tela de Início") e abre mesmo sem sinal.

Os dados ficam numa planilha Google, e um servidor em Google Apps Script faz a ponte com o site. Nomes, CNPJs e budgets **não** ficam neste repositório: vêm da planilha, depois do login.

## Módulos

| Área | O que faz |
|---|---|
| **Esteira** (chamados) | Abertura da OS (origem NOC, Delivery, Elleven ou OEM), classificação pela matriz oficial (SLA e conta contábil), despacho, previsão de chegada do técnico, fila de **validação em campo**, relatório do atendimento, anexos e PDF. Duas visões: **Quadro** (colunas por situação) e **Linha do tempo** (uma linha por técnico ao longo do dia, no estilo de um console de despacho: aguardando, deslocamento, execução, prazo, previsão de chegada e a hora atual). |
| **App do técnico** | Fila de OS, aceite, deslocamento com **previsão de chegada automática** (abre Google Maps ou Waze), chegada com GPS, **pedido de validação** ao NOC/O&M, fotos com carimbo (estilo Timemark, com a logo oficial Net Turbo) e conclusão técnica. Toque na foto abre em tela cheia, com zoom para ler o carimbo. Tem também a LPU, os materiais, a fibra do atendimento e **Meu estoque** (o saldo do técnico e da dupla). |
| **Gestão de LPU** | Conferência e aprovação dos itens que o prestador cobra, por conta contábil e budget. |
| **Service Desk, Materiais e Cadastro de Fibra** | Gestões ligadas ao chamado, cada uma com seu ciclo; elas não mexem no MTTR/SLA. Material e fibra aceitam "sem atividade" quando o atendimento não usou material ou não mexeu em fibra. |
| **Estoque dos técnicos** | Importa os relatórios do Elleven (movimentações, saldo de materiais de consumo e ativos com número de série). Cada estoque do relatório é ligado ao técnico automaticamente na importação, e o app mostra ao técnico o que ele e a dupla têm. O Elleven continua sendo o estoque oficial: o SigoNet só informa a baixa. |
| **Portal de Gestão** | KPIs do mês nas visões **Global, Rompimento, Massiva e Improdutivas**, com MTTD, MTTA, MTTR, SLA, **Tempo em campo**, **Espera de validação** e **IRR** (reincidência por circuito). Eficiência por técnico. **Financeiro da LPU**: OPEX e CAPEX (lançado, aprovado e projeção do mês contra o budget), saldo a pagar e ticket médio por prestador, projeção por conta contábil, serviços mais usados e hora-homem por colaborador. As **abas de segmento** filtram a tela inteira (KPIs, LPU, contas, materiais e fibra). Exporta para Excel. |
| **Preventiva** | Rotas de preventiva **aérea** (KMZ, metros percorridos, postes, cordoalha, plaquetas, caixas e sobra técnica; meta mensal) e **subterrânea** (vistoria caixa a caixa, com fotos padronizadas e listas fechadas). Telas: Planejamento, Revisão (com filtros para escolher o que validar primeiro), Dashboard e **Mapa de atuação** (mapa de calor com as CS vistoriadas e o traçado das rotas aéreas), mais o app do técnico, que funciona offline e mostra o mapa da rota aérea. A **Base KML** recebe o KMZ da rede (o nome do arquivo vira o cluster; entram as pastas de CS e CEO, com prévia antes de gravar). Na aérea, os metros saem das linhas do KMZ e cada item pede o seu mínimo de fotos (câmera ou galeria). A cobrança sai pelo fluxo normal de chamado e LPU. O manual completo (`docs/PREVENTIVA.md`) fica na pasta de trabalho. |
| **Melhoria de rede** e **Retirada de cabo** | Obras planejadas, cada uma com a sua conta contábil (Melhoria → 0103, Retirada → 0102) e o seu menu: **Planejamento**, **Revisão** e **Dashboard**. Despachar cria o chamado na conta do programa. O técnico aponta a produção em parciais e um **Finalizado**: na Melhoria, os serviços da LPU com as quantidades; na Retirada, os metros de cabo e as CEO/CTO retiradas. As fotos são obrigatórias. Aprovado na Revisão, o chamado conclui e a LPU nasce preenchida. Dashboard da Retirada por região; da Melhoria, cabo lançado por POP e por cidade, com o valor da conta contra o budget. |
| **Conversa e acompanhamento ao vivo** | Cada chamado tem uma **conversa** entre a gestão e o técnico, com imagem, PDF, KMZ e coordenadas, e a gestão pode chamar outras pessoas. Na Preventiva, na Melhoria e na Retirada, o botão **Acompanhar** mostra ao vivo o que o técnico está preenchendo, o que falta, as fotos que já subiram e a posição dele. A conversa pode entrar no PDF, completa ou em resumo. |
| **Cadastros e Acessos, Auditoria** | Empresas, técnicos, liderança e telas liberadas por pessoa; log de tudo o que foi alterado. |

## Jornada em campo do chamado

1. **Aceite** da OS pelo técnico.
2. **Iniciar deslocamento · ver previsão de chegada:** o app pega o GPS do técnico e calcula a rota de carro até o cliente (pelo link do mapa do chamado ou pelo endereço). O cálculo é do OpenStreetMap e **não considera trânsito**. O técnico navega pelo Google Maps ou pelo Waze, e a gestão vê "chega ~hh:mm" no chamado.
3. **Cheguei no local** (registra o GPS).
4. **Pedir validação:** terminado o serviço, o técnico pede a validação e preenche o relatório (RFO) enquanto espera. Quem valida:
   - origem **OEM** → O&M (cargo OEM, Encarregado, Gestor ou Gerente);
   - demais origens → NOC (quem tem a tela Esteira, ou cargo Encarregado, Gestor ou Gerente).
   A resposta é **Validado** ou **Ainda com falha** (volta ao técnico com o motivo).
5. **Concluir atendimento:** só depois de validado.

**Relatório do atendimento:** causa e solução são obrigatórias, e o técnico informa se trabalhou na CEO. Com **CEO nova**, o número (ex.: 4521 ou 4521A) e o endereço de cada uma são obrigatórios; no caso "nova → nova", a CEO A e a B não podem ter o mesmo endereço. O relatório é **salvo automaticamente** enquanto o técnico escreve e quando ele sai do app; nada se perde se ele fechar o app ou o celular desligar.

**Como os tempos são contados**
- MTTR, SLA e **Tempo em campo** terminam na hora em que o técnico **pediu** a validação que foi aceita, e não na hora da resposta.
- Se voltar "ainda com falha", o tempo continua correndo até um novo pedido aceito.
- **Tempo em campo** = chegada no local → pedido de validação aceito (eficiência do técnico).
- **Espera de validação** = soma do tempo que o NOC/O&M levou para responder (tempo ocioso).
- Chamados sem validação (antigos e Preventiva) terminam na conclusão técnica.

O técnico e o NOC podem mexer no mesmo chamado ao mesmo tempo (RFO de um lado, validação do outro): o servidor junta as duas alterações. Só o mesmo campo alterado pelos dois vira aviso de conflito.

## Preventiva: como criar as atividades

1. **Pela Preventiva:** Menu **Preventiva → Planejamento → Nova rota**. Escolha *Aérea* ou *Subterrânea*, preencha e clique em **Salvar e despachar**. O chamado Preventiva é criado sozinho e entra na fila do técnico.
   Use **Data-limite** quando a rota levar mais de um dia (em branco = o próprio dia planejado).
2. **A partir de uma OS aberta no NOC:** no chamado do tipo Preventiva, clique em **🧭 Transformar em rota de Preventiva**. A rota fica ligada ao mesmo chamado, sem abrir outro.

Só o que foi **aprovado na Revisão** entra na medição e no pagamento.

**Mesma CS em duas equipes não:** uma CS que está na rota de uma equipe não entra na rota de outra, nem com "Forçar". O "Forçar" serve só para vistoriar de novo uma CS já concluída.

**Mudar uma rota já despachada:** em Planejamento → Rotas, o botão **CS da rota** tira, soma ou troca CS sem retirar o despacho. CS com vistoria já enviada não sai. CS tirada fica livre para outra equipe, e o técnico não consegue mais enviá-la.

**Fechar a rota:** todas as CS que estão na rota precisam estar aprovadas na Revisão, e a rota precisa estar concluída. CS que não será feita: tire pelo **CS da rota**. CS que o técnico não conseguiu abrir: ele envia com "Conseguiu abrir: Não" e o motivo. Se o técnico enviou tudo e não tocou em "Concluir rota", a gestão usa **Concluir pela gestão** (com motivo, fica no histórico). Com tudo aprovado, o chamado conclui sozinho e a LPU libera.

**Revisão:** o selo **Refeita após rejeição** só aparece quando a CS foi rejeitada e o técnico mandou de novo. Reenvio automático por falha de sinal não conta e não tira a CS do lugar na fila.

**Prazo da atividade planejada:** o chamado da Preventiva não segue o SLA em horas da matriz. O prazo é o fim do dia da data-limite da rota, e o SLA é "concluída até a data". Por ser planejada, a Preventiva fica fora das médias de MTTD, MTTA e MTTR do Portal (que medem a corretiva); conta o tempo em campo.

## Melhoria de rede e Retirada de cabo

1. **Planejamento → Nova atividade:** cidade (a região sai sozinha), endereço e link do local (dá para anexar KMZ/KML), POP (obrigatório na Melhoria), serviço, prestador e datas. A observação aceita print colado (Ctrl+V), imagem e PDF, e o técnico vê esses anexos. **Salvar e despachar** cria o chamado na conta do programa.
2. **Técnico:** abre a atividade pela OS e envia apontamentos **Parcial** (quando a equipe volta outro dia) e um **Finalizado**, que conclui a atividade.
3. **Revisão:** aprova, rejeita (o técnico refaz) ou reabre cada apontamento. Com o Finalizado e tudo aprovado, o chamado conclui e a LPU nasce preenchida com o que foi aprovado.

Na lista do Planejamento, cada atividade tem:
- **Acompanhar:** ao vivo, com a conversa ao lado;
- **PDF:** resumo da atividade, com a produção aprovada, a LPU gerada e o valor estimado. A conversa entra se a gestão quiser;
- **Baixar tudo:** um .zip com o resumo e a ficha de cada apontamento com as fotos (as fotos originais em JPG são opcionais);
- **Concluir pela gestão:** quando a equipe mandou os parciais e não o Finalizado. Só vale com a atividade em campo e sem apontamento rejeitado. Pede um motivo, que fica no histórico e no PDF. O chamado conclui quando tudo estiver aprovado.

Uma atividade só planejada não aparece na Esteira. Essas atividades também não aparecem nas telas da Preventiva.

## Quem aprova

- As **telas** definem o que cada pessoa abre, e o **cargo** libera ações.
- **Gerente e Gestor:** tudo.
- **Encarregado:** aprova LPU e valida fibra. Valida os chamados da Esteira (NOC e O&M). Revisa as obras da Preventiva, da Melhoria e da Retirada: aprova, rejeita, reabre e acompanha ao vivo. Não precisa ter as telas marcadas. **Não** planeja nem despacha.
- **OEM:** sala técnica (GEOGRID, materiais e service desk) e validação dos chamados de origem OEM.
- **Melhoria e Retirada:** quem tem a tela de Planejamento do programa planeja, despacha, revisa e conclui pela gestão.

## Acesso

- Entrada com **nome, PIN e complemento pessoal**. O PIN é dado pela gestão e pode ter letras e números (maiúsculas e minúsculas valem igual).
- O complemento é criado pela própria pessoa no 1º acesso; a gestão só consegue resetar.
- Cinco tentativas erradas bloqueiam o acesso por 15 minutos.

## Uso no dia a dia

- **Botões:** toda ação que busca ou grava no servidor mostra que está carregando (o botão gira e fica travado, sem clique duplo). Se passar de ~1 s, aparece o foguete "Carregando…" no rodapé.
- **Fotos:** toque na miniatura abre em tela cheia; outro toque amplia no ponto tocado; deslize ou use ‹ › para passar; "voltar" fecha.
- **Sem sinal:** o técnico continua trabalhando; fotos, CS e apontamentos ficam no celular e sobem quando o sinal voltar. O acompanhamento ao vivo da gestão só atualiza quando há sinal.

## Estrutura

```
index.html        tela única (roteamento por #hash)
css/sigonet.css   tema
js/nucleo.js      base comum (SN): rotas, modais, banco local, sessão
js/servidor.js    sincronização com o Apps Script
js/campo.js       jornada em campo: previsão de chegada, validação NOC/O&M
js/telas-*.js     telas de cada módulo (telas-esteira.js = linha do tempo)
js/estoque*.js    estoque dos técnicos (leitura dos relatórios do Elleven)
js/instalar.js    instalação como aplicativo; sw.js abre o site sem sinal
js/vistoria-*.js  Preventiva: listas, regras (compartilhadas com o servidor), fila offline, câmera, PDF, ao vivo
js/telas-programadas*.js  Melhoria de rede e Retirada de cabo (gestão e app do técnico)
js/conversa.js    conversa do chamado
js/catalogos.js   matriz de classificação e catálogo de LPU
js/dados.js       versão pública (sem pessoas, CNPJs nem budgets)
```

Este repositório recebe só a parte pública (o site). O código do servidor (Apps Script), os testes e as ferramentas ficam fora dele.

## Publicação

O conteúdo deste repositório é gerado por `node ferramentas/publicar.mjs` a partir da pasta de trabalho. O script:
- troca o `dados.js` pela versão pública e para se algum dado sensível ficar no pacote;
- marca os arquivos no `index.html` com a versão (`?v=` + hash do conteúdo) e grava essa versão no `sw.js`. Assim, navegador e app instalado pegam o site novo com um simples recarregar, sem ficar presos à cópia guardada.

Não edite os arquivos daqui à mão. Depois do push, o GitHub Pages atualiza em 1 a 2 minutos.

Antes de publicar uma mudança de tela, a pasta de trabalho tem um verificador de layout (`testes/layout/checar-layout.mjs`). Ele abre todas as telas da gestão em 1366, 1600 e 1920 px, com nomes longos de propósito, e falha se algum texto sair de card, botão ou página.
