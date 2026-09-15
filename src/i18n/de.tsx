/**
 * Every word the dashboard shows, in Austrian German. Typed against `en.tsx`.
 *
 * Austrian usage where it differs: Jänner, aushaftend, Spesen, KESt.
 */

import type { ComponentChildren } from 'preact';

import type { Basis, Messages } from './en';

const RATE: Record<Basis, string> = { effective: 'Effektivzins', nominal: 'Nominalzins' };
const other = (basis: Basis): Basis => (basis === 'effective' ? 'nominal' : 'effective');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const de: Messages = {
  otherLanguage: { label: 'English', code: 'en', path: '' },

  app: {
    brand: 'Österreich',
    nav: 'Produkte',
    pages: { housing: 'Wohnkredite', savings: 'Sparen', consumer: 'Konsumkredite', market: 'Zinsen & EZB' },
    offersChecked: (date: string) => `Angebote geprüft am ${date}`,
    ecbTo: (period: string) => `EZB-Statistik bis ${period}`,
    footer: (ecb: ComponentChildren, github: ComponentChildren) => (
      <>
        Zinsstatistiken aus dem {ecb}, live abgerufen. Angebote werden einmal täglich von den Websites und Rechnern der
        Banken gelesen; sie sind unverbindlich und kein Angebot. Quellcode auf {github}.
      </>
    ),
  },

  format: {
    months: ['Jän', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    monthsLong: [
      'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
    ],
    day: (day: number, month: string, year: string) => `${day}. ${month} ${year}`,
    bp: 'BP',
    euro: (amount: string) => `${amount} €`,
    millions: (amount: string) => `${amount} Mio. €`,
    billions: (amount: string) => `${amount} Mrd. €`,
    yrs: 'J.',
    instantAccess: 'Täglich fällig',
    termMonths: (n: number) => `${n} ${plural(n, 'Monat', 'Monate')}`,
    termYears: (n: number) => `${n} ${plural(n, 'Jahr', 'Jahre')}`,
    instant: 'Täglich',
    monthsShort: (n: string) => `${n} M`,
    yearsShort: (n: string) => `${n} J`,
    variable: 'Variabel',
    variableRate: 'Variabler Zinssatz',
    fixedFor: (years: string) => `${years} Jahre fix`,
    fixedWholeTerm: 'Fix über die gesamte Laufzeit',
    rungs: {
      fixed: 'fix',
      variable: 'variabel',
      '10y fixed': '10 Jahre fix',
      'full-term fixed': 'fix über die gesamte Laufzeit',
      'calculator quote': 'Rechnerangebot',
      promotional: 'Aktion',
      standard: 'Standard',
      'base rate': 'Basiszins',
      'headline offer': 'Top-Angebot',
    },
  },

  common: {
    loading: 'Wird geladen…',
    showNumbers: 'Zahlen anzeigen',
    about: 'Über diese Daten',
    sources: (read: number, total: number) => `Quellen · ${read} von ${total} beim letzten Abruf gelesen`,
    status: { ok: 'gelesen', partial: 'teilweise', failed: 'fehlgeschlagen', unavailable: 'nicht verfügbar' },
    lenders: 'Anbieter',
    showAll: 'Alle anzeigen',
    view: 'Ansicht',
    range: 'Zeitraum',
    ranges: { '1y': '1 J', '3y': '3 J', all: 'Alle' },
    ecbHistory: 'EZB-Verlauf',
    ecbWindows: { '5y': '5 J', '10y': '10 J', max: 'Seit 2003' },
    ecbLoading: 'EZB-Statistiken werden geladen…',
    ecbFailed: (error: string) => `ECB Data Portal nicht erreichbar. ${error}`,
    latestChanges: 'Letzte Änderungen',
    archivedPage: 'archivierte Seite',
    source: 'Quelle',
    currentOffer: 'Aktuelles Angebot',
    pickHint: 'Spalte anklicken, um ihren Verlauf zu verfolgen',
    checked: (date: string) => `Geprüft am ${date}`,
    austria: 'Österreich',
    euroArea: 'Euroraum',
    basis: { effective: 'effektiv', nominal: 'nominal' },
    basisRate: RATE,
    ecbAverage: 'EZB-Durchschnitt',
    ecbConcludedAverage: 'EZB-Durchschnitt der Abschlüsse',
    ecbConcluded: (what: string) => `EZB-Abschlüsse, ${what}`,
    agreedRate: 'Vereinbarter Zinssatz',
    aprcFees: 'Effektivzins inkl. Spesen',
    rateVsAprc: 'Zinssatz vs. Effektivzins',
    byFixation: 'Nach Zinsbindung',
    newVsExisting: 'Neu vs. Bestand',
    volume: 'Volumen',
    buckets: {
      variable: 'Variabel / bis 1 J',
      fixed1to5: 'Fix 1–5 J',
      fixed5to10: 'Fix 5–10 J',
      fixedOver10: 'Fix über 10 J',
      fixedOver5: 'Fix über 5 J',
    },
    deposits: {
      overnight: 'Täglich fällig',
      notice: 'Mit Kündigungsfrist',
      termTo1: 'Termin bis 1 J',
      term1to2: 'Termin 1–2 J',
      termOver2: 'Termin über 2 J',
    },
    depositFacility: 'EZB-Einlagesatz',
    overdrafts: 'Überziehungskredite',
  },

  charts: {
    fixationAxis: 'Anfängliche Zinsbindung',
    termAxis: 'Laufzeit',
    noQuote: 'Kein Angebot erfasst',
    newLending: 'Neugeschäft',
    austriaGap: (gap: string) => `Österreich ${gap}`,
  },

  panel: {
    lastYear: (amount: string) => `letzte 12 Monate ${amount}`,
    volumeHead: ['Monat', 'Volumen'],
    linesHead: ['Reihe', 'Aktuell', 'Monat', '12 Monate davor', 'Veränderung'],
  },

  housing: {
    bands: {
      hl_var: 'variabel oder bis 1 Jahr fix',
      hl_1_5: 'über 1 bis 5 Jahre fix',
      hl_5_10: 'über 5 bis 10 Jahre fix',
      hl_10p: 'über 10 Jahre fix',
    },
    newLoans: 'Neukredite',
    outstanding: 'Alle aushaftenden Kredite',
    renegotiated: 'Neuverhandelt',
    genuinelyNew: 'Echte Neuverträge',
    renegotiatedLoans: 'Neuverhandelte Kredite',
    calculatorQuote: 'Rechnerangebot',
    example: 'Repräsentatives Beispiel',
    calculator: 'Rechner',
    bankDate: (date: string) => `Stand der Bank ${date}`,
    noBankDate: 'Kein Stand der Bank angegeben',
    checked: (date: string) => `geprüft am ${date}`,
    outdated: (days: number) => `Veraltet: Der Stand der Bank ist älter als ${days} Tage`,
    noQuote: 'Kein aktuelles Angebot',
    aprcNewLoans: 'Effektivzins, neue Wohnkredite',
    newLoansIn: (band: string) => `Neukredite ${band}`,
    allFixations: 'alle Zinsbindungen',
    agreedRate: 'vereinbarter Zinssatz',
    ecbAprcAll: 'EZB-Abschlüsse Effektivzins, alle Zinsbindungen',
    lede: (basis: Basis, quotes: number, lenders: number, date: string) =>
      `Niedrigste beworbene ${basis === 'effective' ? 'Effektivzinsen' : 'Nominalzinsen'} aus ${quotes} aktuellen Angeboten von ${lenders} Anbietern, geprüft am ${date}.`,
    fixed10: '10 Jahre fix',
    fixed20: '20 Jahre fix oder länger',
    ecbDetail: (period: string, aprc: boolean) => `${period} · alle Neukredite${aprc ? ', Effektivzins' : ''}`,
    rate: 'Zinssatz',
    outdatedExamples: 'Veraltete Beispiele',
    curveTitle: 'Heute beworben, nach Zinsbindung',
    curveMeta: 'Ein Punkt pro Angebot. Die Rechner-Staffel eines Anbieters ist mit einer Linie verbunden.',
    curveAria:
      'Beworbene Wohnkreditzinsen in Österreich nach anfänglicher Zinsbindung, ein Symbol pro Anbieter, verglichen mit den EZB-Durchschnitten der Abschlüsse',
    bandPerBucket: 'EZB-Durchschnitt der Abschlüsse je Zinsbindungsklasse',
    hollow: (days: number) => `Beispiel laut Stand der Bank älter als ${days} Tage`,
    unpublished: (lenders: string[], basis: Basis) =>
      `Nicht angezeigt: ${lenders.join(', ')}, ohne veröffentlichten ${RATE[basis]}. Mit „${RATE[other(basis)]}“ sichtbar.`,
    offersHead: ['Anbieter', 'Produkt', 'Zinsbindung', 'Nominal', 'Effektiv', 'Stand der Bank', 'Geprüft'],
    years: (years: string) => `${years} Jahre`,
    outdatedMark: ' (veraltet)',
    historyTitle: (fixation: string) => `Verlauf der beworbenen Zinsen: ${fixation}`,
    historyMeta: 'Jedes Angebot gilt, bis es ersetzt wurde; grau ist der EZB-Durchschnitt der Abschlüsse.',
    fixation: 'Zinsbindung',
    historyAria: (fixation: string) => `Beworbene Wohnkreditzinsen im Zeitverlauf, ${fixation}`,
    recordedFrom: (date: string) =>
      `Erfasst seit ${date}. Davor gibt es für diese Angebote keine brauchbaren Archivkopien.`,
    missing: (lenders: string[], basis: Basis) =>
      `Ohne veröffentlichten ${RATE[basis]}: ${lenders.join(', ')}. Mit „${RATE[other(basis)]}“ sichtbar.`,
    noRepricing: 'Für diese Zinsbindung ist noch keine Zinsänderung erfasst.',
    changesHead: ['Geändert', 'Anbieter', 'Vorher', 'Nachher', 'Änderung'],
    panelTitle: 'Abgeschlossenes Neugeschäft',
    panelMeta:
      'EZB-Zinssatzstatistik der MFIs für Österreich: alle neuen Wohnkredite, volumengewichtet, monatlich, rund fünf Wochen später veröffentlicht.',
    about: (staleDays: number) => (
      <>
        <p>
          <strong>Rechnerangebote</strong> stammen aus den Kreditrechnern der Banken. bank99, Bank Austria und Oberbank
          werden für ein einheitliches Profil abgefragt, 300.000 € über 25 Jahre; Bank Burgenland und Raiffeisen
          Bausparkasse veröffentlichen Zinstabellen, die die Kredithöhe nicht berücksichtigen. Sie gelten am Tag des
          Abrufs.
        </p>
        <p>
          <strong>Repräsentative Beispiele</strong> sind die Musterrechnungen, die Kreditgeber nach § 6 HIKrG
          veröffentlichen müssen, jeweils mit einer Kredithöhe und Laufzeit nach Wahl der Bank – sie sind daher nur grob
          vergleichbar. Datiert werden sie durch den <em>Stand</em> der Bank. Ist ein Beispiel laut diesem Stand älter
          als {staleDays} Tage, wird es hohl dargestellt, und seine Verlaufslinie endet dort.
        </p>
        <p>
          <strong>Der Verlauf</strong> vor Beginn der täglichen Erfassung ist aus Kopien derselben Seiten im Internet
          Archive rekonstruiert. Die Kopien entstehen etwa monatlich; wo eine Bank keinen Stand nennt, wird eine
          Zinsänderung auf die erste Kopie datiert, die sie zeigt.
        </p>
        <p>
          <strong>EZB-Durchschnitte</strong> umfassen jeden neuen Wohnkredit in Österreich im jeweiligen Monat,
          volumengewichtet. Der vereinbarte Zinssatz ist nach Zinsbindungsklassen aufgeteilt; den Effektivzins, der die
          Spesen enthält, gibt es nur über alle Zinsbindungen. Für den Vergleich zwischen Banken ist der Effektivzins
          maßgeblich.
        </p>
      </>
    ),
  },

  savings: {
    bands: {
      dep_on: 'täglich fällige Einlagen',
      dep_term_le1: 'Termineinlagen bis 1 Jahr',
      dep_term_1_2: 'Termineinlagen über 1 bis 2 Jahre',
      dep_term_2p: 'Termineinlagen über 2 Jahre',
    },
    byProduct: 'Nach Produkt',
    passThrough: 'Weitergabe',
    newTerm: 'Neue Termineinlagen',
    outstandingTerm: 'Alle bestehenden Termineinlagen',
    overnightAustria: 'Täglich fällig, Österreich',
    termAustria: 'Termin, Österreich',
    overnightEuroArea: 'Täglich fällig, Euroraum',
    promotional: 'Aktion',
    noOffer: 'Kein aktuelles Angebot',
    newIn: (band: string) => `neue ${band}`,
    households: 'private Haushalte',
    afterTax: 'nach 25 % KESt',
    beforeTax: 'vor Steuer',
    branchBank: 'Filialbank',
    directBank: 'Direktbank',
    minimum: (amount: string) => `Mindestens ${amount}`,
    unconfirmed: (days: number) => `Seit mehr als ${days} Tagen nicht bestätigt`,
    lede: (afterTax: boolean, banks: number, date: string) =>
      `Höchste beworbene Zinsen ${afterTax ? 'nach 25 % KESt' : 'vor Steuer'} von ${banks} Banken, geprüft am ${date}.`,
    fixed1: '1 Jahr fix',
    fixed2: '2 Jahre fix oder länger',
    ecbTerm: 'EZB-Abschlüsse, Termin bis 1 Jahr',
    allBanks: (period: string) => `${period} · alle österreichischen Banken`,
    taxSwitch: 'Nach 25 % KESt',
    curveTitle: 'Heute beworben, nach Laufzeit',
    curveMeta: 'Ein Punkt pro Zinssatz. Die Laufzeitstaffel einer Bank ist mit einer Linie verbunden.',
    curveAria:
      'Beworbene Sparzinsen in Österreich nach Laufzeit, ein Symbol pro Bank, verglichen mit den EZB-Durchschnitten der Abschlüsse',
    bandPerBucket: 'EZB-Durchschnitt der Abschlüsse je Laufzeitklasse',
    offersHead: ['Bank', 'Produkt', 'Laufzeit', 'Zinssatz', 'Mindestbetrag', 'Typ', 'Geprüft'],
    branch: 'Filiale',
    direct: 'Direkt',
    historyTitle: (term: string) => `Verlauf der beworbenen Zinsen: ${term}`,
    historyMeta: 'Jeder Zinssatz gilt, bis er sich ändert; grau ist der EZB-Durchschnitt der Abschlüsse.',
    term: 'Laufzeit',
    historyAria: (term: string) => `Beworbene Sparzinsen im Zeitverlauf, ${term}`,
    recordedFrom: (date: string) =>
      `Sparangebote werden seit ${date} täglich erfasst; frühere Bewegungen zeigt nur der EZB-Durchschnitt.`,
    noChange: 'Seit Beginn der täglichen Erfassung keine Zinsänderung für diese Laufzeit.',
    panelTitle: 'Abgeschlossene Einlagen',
    panelMeta:
      'EZB-Zinssatzstatistik der MFIs für private Haushalte in Österreich: Neugeschäft, volumengewichtet, monatlich. Die Weitergabe ist der Anteil der EZB-Zinsänderung seit Mitte 2022, der bei Sparern angekommen ist.',
    about: () => (
      <>
        <p>
          <strong>Direktbanken</strong> (Addiko, Anadi, bank99, easybank, Kommunalkredit Invest) veröffentlichen einen
          österreichweiten Zinssatz auf ihrer Website. <strong>Filialbanken</strong> (BAWAG P.S.K., Raiffeisen)
          veröffentlichen nur den vorgeschriebenen Zinsaushang; Raiffeisen besteht aus rund dreihundert eigenständigen
          Banken, daher werden zwei unter eigenem Namen gezeigt.
        </p>
        <p>
          Die Zinssätze verstehen sich vor 25 % KESt, außer der Steuerschalter ist aktiv. Aktionszinssätze, die danach
          sinken, stehen neben dem Zinssatz, der anschließend gilt.
        </p>
        <p>
          <strong>EZB-Durchschnitte</strong> umfassen jeden Euro, der in diesem Monat bei österreichischen Banken
          angelegt wurde, volumengewichtet – sie liegen daher nahe bei den Filialbanken, wo das meiste Geld liegt. Erste
          Bank, Bank Austria und Volksbank veröffentlichen keine auslesbaren Sparzinsen und fehlen daher.
        </p>
      </>
    ),
  },

  consumer: {
    vsOther: 'vs. andere Kredite',
    consumerEuroArea: 'Konsumkredite, Euroraum',
    lede: (period: string | undefined) =>
      `Was private Haushalte in Österreich${period ? ` im ${period}` : ''} abgeschlossen haben, und die wenigen Konsumkredit-Beispiele, die eine Bank in auslesbarer Form veröffentlicht.`,
    ecbAgreed: 'EZB-Abschlüsse, vereinbarter Zinssatz',
    allNew: 'Alle neuen Konsumkredite',
    ecbAprc: 'EZB-Abschlüsse, Effektivzins',
    includingFees: 'Inklusive Spesen',
    revolving: 'Revolvierende Kredite',
    lowest: 'Niedrigster beworbener Effektivzins',
    nonePublished: 'Keiner veröffentlicht',
    title: 'Heute beworben',
    meta: 'Repräsentative Beispiele gemäß § 5 VKrG. Konsumkredite werden je Kunde bepreist, daher veröffentlicht kaum eine Bank eine auslesbare Zahl.',
    since: (date: string) => `Seit ${date} täglich erfasst; bisher keine Änderung.`,
    noHistory: 'Noch kein Verlauf erfasst.',
    panelTitle: 'Abgeschlossene Konsumkredite',
    panelMeta:
      'EZB-Zinssatzstatistik der MFIs für private Haushalte in Österreich: Neugeschäft, volumengewichtet, monatlich.',
    about: () => (
      <>
        <p>
          Der Effektivzins enthält Bearbeitungsgebühren und sonstige Spesen. Bei Konsumkrediten liegt er weit über dem
          vereinbarten Zinssatz, weil sich dieselben Fixkosten auf einen viel kleineren Kredit verteilen als bei einem
          Wohnkredit.
        </p>
        <p>
          Die EZB gliedert Konsumkredite nach anfänglicher Zinsbindung: variabel oder bis ein Jahr, über ein bis fünf
          Jahre und über fünf Jahre.
        </p>
      </>
    ),
  },

  market: {
    policyMoney: 'Leitzins & Geldmarkt',
    margins: 'Bankmargen',
    housingOverEstr: 'Wohnkredite über €STR',
    estrOverOvernight: '€STR über täglich fälligen Einlagen',
    corporates: 'Unternehmen',
    allNewLoans: 'Alle Neukredite',
    outstanding: 'Bestand',
    outstandingTerm: 'Termineinlagen, Bestand',
    costOfBorrowing: 'Finanzierungskosten',
    overnightDeposits: 'Täglich fällige Einlagen',
    termDeposits: 'Termineinlagen',
    lede: 'Die Referenzsätze, an denen sich die Preise österreichischer Banken orientieren, und wie Österreich im Vergleich zum Euroraum liegt.',
    mro: 'Hauptrefinanzierungssatz',
    ecb: 'EZB',
    asOf: (date: string) => `Stand ${date}`,
    monthlyAverage: (period: string) => `${period} · Monatsdurchschnitt`,
    panelTitle: 'Referenzsätze und Margen',
    panelMeta: 'Monatlich. Als Näherung für die Refinanzierungskosten der Banken dient €STR.',
    compareTitle: 'Österreich im Vergleich zum Euroraum',
    compareMeta: (period: string) =>
      `Letzter Monat jeder EZB-Reihe, bis ${period}. Für den Abstand mit der Maus über eine Zeile fahren.`,
    compareAria: (group: string) => `${group}: österreichische Zinssätze im Vergleich zum Euroraum`,
    compareHead: ['Produkt', 'Reihe', 'Österreich', 'Euroraum', 'Abstand'],
    about: () => (
      <>
        <p>
          Leitzinsen, €STR und Euribor stammen aus dem ECB Data Portal. Der Euribor wird als Monatsdurchschnitt der EZB
          gezeigt: Der tägliche Euribor ist von EMMI lizenziert und wird hier nicht weitergegeben, daher dient €STR als
          täglicher Referenzsatz.
        </p>
        <p>
          Kredit- und Einlagenzinssätze stammen aus der MFI-Zinssatzstatistik und erscheinen rund fünf Wochen nach dem
          Berichtsmonat.
        </p>
      </>
    ),
  },
};
