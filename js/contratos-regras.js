// SIGONET V2 — Contratos fixos (Service Desk → CLT e contratos fixos): regras puras.
//
// Pedido do usuário (2026-10-16). Empresas/equipes com valor fixo mensal e meta de atividades:
//   - ciclo do dia 21 ao dia 20 (chave 'AAAA-MM' = mês em que o ciclo termina; pagamento dia 28);
//   - atividade = OS concluída (conclusão técnica no ciclo, não cancelada) cujo titular é de uma
//     equipe do contrato (equipes null = a empresa inteira);
//   - abaixo da meta: improdutivo = falta × (fixo ÷ meta), só informativo (o fixo é pago cheio);
//   - acima da meta: cada atividade a mais paga valorExcedente;
//   - variáveis: pagas quando o Service Desk marca "cumprido" no ciclo.
// Contrato sem meta (ex.: SOUZA, em definição) não conta atividade nem muda o vínculo da LPU.
// Roda no navegador (window.CFR) e no Node (testes).
(function (raiz) {
  var R = {};
  var r2 = function (v) { return Math.round((Number(v) || 0) * 100) / 100; };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  // Ciclo de uma data (hora local): do dia 21 em diante já é o ciclo do mês seguinte.
  R.cicloDe = function (iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var a = d.getFullYear(), m = d.getMonth() + (d.getDate() >= 21 ? 1 : 0);
    if (m > 11) { m = 0; a++; }
    return a + '-' + pad(m + 1);
  };
  // [início, fim) do ciclo em hora local: 21 do mês anterior 00:00 até 21 do mês 00:00.
  R.intervalo = function (ciclo) {
    var a = +ciclo.slice(0, 4), m = +ciclo.slice(5, 7) - 1;
    return [new Date(a, m - 1, 21), new Date(a, m, 21)];
  };
  R.rotulo = function (ciclo) {
    var iv = R.intervalo(ciclo), fim = new Date(iv[1] - 864e5);
    return pad(iv[0].getDate()) + '/' + pad(iv[0].getMonth() + 1) + ' a ' + pad(fim.getDate()) + '/' + pad(fim.getMonth() + 1) + '/' + fim.getFullYear();
  };
  R.mover = function (ciclo, passo) {
    var a = +ciclo.slice(0, 4), m = +ciclo.slice(5, 7) - 1 + passo;
    var d = new Date(a, m, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };
  // Meses (AAAA-MM) cujos chamados podem cair no ciclo: o próprio e o anterior.
  R.mesesDoCiclo = function (ciclo) { return [R.mover(ciclo, -1), ciclo]; };
  // Ciclos que existem para o contrato: do primeiro ciclo contado (k.inicio) até "ate".
  R.ciclosDoAno = function (k, ano, ate) {
    var out = [];
    for (var i = 1; i <= 12; i++) { var c = ano + '-' + pad(i); if (c <= ate && (!k.inicio || c >= k.inicio)) out.push(c); }
    return out;
  };

  // "Equipe 01" = "EQUIPE 1" = "equipe1".
  R.chaveEquipe = function (s) {
    var t = String(s || '').toLowerCase().replace(/\s+/g, '');
    return t.replace(/(\d+)/g, function (n) { return String(Number(n)); });
  };
  R.ativo = function (k) { return !!k && Number(k.metaAtividades) > 0; };
  R.daEquipe = function (k, empresa, equipe) {
    if (!R.ativo(k) || k.empresa !== empresa) return false;
    if (!k.equipes) return true;
    var e = R.chaveEquipe(equipe);
    return !!e && k.equipes.some(function (x) { return R.chaveEquipe(x) === e; });
  };
  // Contrato (com meta) em que esse técnico conta. equipeDe: nome → equipe do cadastro.
  R.contratoDo = function (contratos, empresa, equipe) {
    return (contratos || []).filter(function (k) { return R.daEquipe(k, empresa, equipe); })[0] || null;
  };

  // OS do contrato no ciclo: concluídas (conclusão técnica no intervalo), não canceladas,
  // da empresa e com o titular numa equipe do contrato.
  R.atividades = function (k, chamados, equipeDe, ciclo) {
    if (!R.ativo(k)) return [];
    var iv = R.intervalo(ciclo);
    return (chamados || []).filter(function (c) {
      var t = c.tempos && c.tempos.conclusaoTecnica; if (!t || c.status === 'CANCELADO') return false;
      var d = new Date(t); if (!(d >= iv[0] && d < iv[1])) return false;
      return R.daEquipe(k, c.empresa, equipeDe(c.tecnico));
    }).sort(function (a, b) { return String(a.tempos.conclusaoTecnica).localeCompare(String(b.tempos.conclusaoTecnica)); });
  };

  // Números do ciclo. cumpridas: { desc da variável: true }.
  R.resumo = function (k, feitas, cumpridas) {
    var meta = Number(k.metaAtividades) || 0, fixo = Number(k.valorMensal) || 0;
    var unit = meta ? r2(fixo / meta) : 0;
    var falta = meta ? Math.max(0, meta - feitas) : 0, excedente = meta ? Math.max(0, feitas - meta) : 0;
    var vars = (k.variaveis || []).map(function (v) { return { desc: v.desc, valor: Number(v.valor) || 0, cumprido: !!(cumpridas || {})[v.desc] }; });
    var variaveis = r2(vars.reduce(function (s, v) { return s + (v.cumprido ? v.valor : 0); }, 0));
    var valorExcedente = r2(excedente * (Number(k.valorExcedente) || 0));
    return {
      meta: meta, feitas: feitas, falta: falta, excedente: excedente, pct: meta ? Math.round(feitas / meta * 100) : null,
      // improdutivo pela fração do fixo (18 de 18 faltando = o fixo exato, sem sobra de arredondamento)
      fixo: fixo, valorAtividade: unit, improdutivo: meta ? r2(fixo * falta / meta) : 0, valorExcedente: valorExcedente,
      vars: vars, variaveis: variaveis, variaveisMax: r2(vars.reduce(function (s, v) { return s + v.valor; }, 0)),
      total: r2(fixo + valorExcedente + variaveis)
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else raiz.CFR = R;
})(typeof window !== 'undefined' ? window : this);
