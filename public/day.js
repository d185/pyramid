/* Праздники и цитаты для главной страницы.
   Список встроенный, без обращения к внешним службам: так блок работает
   всегда и не зависит от чужого сервиса. Даты в формате «месяц-день». */
window.DAYS = {

  holidays: {
    '01-01': { en: "New Year's Day", ru: 'Новый год', es: 'Año Nuevo', fr: 'Jour de l’An', de: 'Neujahr' },
    '02-21': { en: 'International Mother Language Day', ru: 'Международный день родного языка', es: 'Día Internacional de la Lengua Materna', fr: 'Journée internationale de la langue maternelle', de: 'Internationaler Tag der Muttersprache' },
    '03-08': { en: "International Women's Day", ru: 'Международный женский день', es: 'Día Internacional de la Mujer', fr: 'Journée internationale des femmes', de: 'Internationaler Frauentag' },
    '03-14': { en: 'Pi Day', ru: 'День числа пи', es: 'Día de Pi', fr: 'Journée de pi', de: 'Pi-Tag' },
    '03-20': { en: 'International Day of Happiness', ru: 'Международный день счастья', es: 'Día Internacional de la Felicidad', fr: 'Journée internationale du bonheur', de: 'Internationaler Tag des Glücks' },
    '04-07': { en: 'World Health Day', ru: 'Всемирный день здоровья', es: 'Día Mundial de la Salud', fr: 'Journée mondiale de la santé', de: 'Weltgesundheitstag' },
    '04-22': { en: 'International Mother Earth Day', ru: 'Международный день Матери-Земли', es: 'Día Internacional de la Madre Tierra', fr: 'Journée internationale de la Terre nourricière', de: 'Internationaler Tag der Mutter Erde' },
    '05-01': { en: "International Workers' Day", ru: 'Праздник труда', es: 'Día del Trabajo', fr: 'Fête du Travail', de: 'Tag der Arbeit' },
    '05-21': { en: 'World Day for Cultural Diversity', ru: 'Всемирный день культурного разнообразия', es: 'Día Mundial de la Diversidad Cultural', fr: 'Journée mondiale de la diversité culturelle', de: 'Welttag der kulturellen Vielfalt' },
    '06-05': { en: 'World Environment Day', ru: 'Всемирный день окружающей среды', es: 'Día Mundial del Medio Ambiente', fr: 'Journée mondiale de l’environnement', de: 'Weltumwelttag' },
    '06-18': { en: 'International Picnic Day', ru: 'Международный день пикника', es: 'Día Internacional del Picnic', fr: 'Journée internationale du pique-nique', de: 'Internationaler Picknicktag' },
    '06-21': { en: 'World Music Day', ru: 'Всемирный день музыки', es: 'Día Mundial de la Música', fr: 'Fête de la musique', de: 'Weltmusiktag' },
    '07-30': { en: 'International Day of Friendship', ru: 'Международный день дружбы', es: 'Día Internacional de la Amistad', fr: 'Journée internationale de l’amitié', de: 'Internationaler Tag der Freundschaft' },
    '08-12': { en: 'International Youth Day', ru: 'Международный день молодёжи', es: 'Día Internacional de la Juventud', fr: 'Journée internationale de la jeunesse', de: 'Internationaler Tag der Jugend' },
    '09-08': { en: 'International Literacy Day', ru: 'Международный день грамотности', es: 'Día Internacional de la Alfabetización', fr: 'Journée internationale de l’alphabétisation', de: 'Weltalphabetisierungstag' },
    '09-19': { en: 'Talk Like a Pirate Day', ru: 'День разговора как пират', es: 'Día de Hablar como un Pirata', fr: 'Journée du parler pirate', de: 'Tag des Piratensprechens' },
    '09-21': { en: 'International Day of Peace', ru: 'Международный день мира', es: 'Día Internacional de la Paz', fr: 'Journée internationale de la paix', de: 'Internationaler Tag des Friedens' },
    '10-01': { en: 'International Day of Older Persons', ru: 'Международный день пожилых людей', es: 'Día Internacional de las Personas de Edad', fr: 'Journée internationale des personnes âgées', de: 'Internationaler Tag der älteren Menschen' },
    '10-04': { en: 'World Animal Day', ru: 'Всемирный день защиты животных', es: 'Día Mundial de los Animales', fr: 'Journée mondiale des animaux', de: 'Welttierschutztag' },
    '10-05': { en: "World Teachers' Day", ru: 'Всемирный день учителя', es: 'Día Mundial de los Docentes', fr: 'Journée mondiale des enseignants', de: 'Weltlehrertag' },
    '11-16': { en: 'International Day for Tolerance', ru: 'Международный день терпимости', es: 'Día Internacional de la Tolerancia', fr: 'Journée internationale de la tolérance', de: 'Internationaler Tag der Toleranz' },
    '12-10': { en: 'Human Rights Day', ru: 'День прав человека', es: 'Día de los Derechos Humanos', fr: 'Journée des droits de l’homme', de: 'Tag der Menschenrechte' }
  },

  quotes: [
    { who: 'Marcus Aurelius',
      en: 'Nowhere can a man find a quieter retreat than in his own soul.',
      ru: 'Нигде человек не найдёт более тихого убежища, чем в собственной душе.',
      es: 'En ningún sitio halla el hombre retiro más tranquilo que en su alma.',
      fr: 'Nulle part l’homme ne trouve de retraite plus calme qu’en son âme.',
      de: 'Nirgends findet der Mensch stillere Zuflucht als in der eigenen Seele.' },
    { who: 'Lao Tzu',
      en: 'Thirty spokes meet at the hub, but the use of the wheel is in the emptiness.',
      ru: 'Тридцать спиц сходятся в ступице, но польза колеса — в пустоте.',
      es: 'Treinta radios se unen en el cubo, pero la utilidad de la rueda está en el vacío.',
      fr: 'Trente rayons se joignent au moyeu, mais l’usage de la roue est dans le vide.',
      de: 'Dreißig Speichen treffen sich in der Nabe, doch der Nutzen des Rades liegt in der Leere.' },
    { who: 'Seneca',
      en: 'We suffer more in imagination than in reality.',
      ru: 'В воображении мы страдаем чаще, чем наяву.',
      es: 'Sufrimos más en la imaginación que en la realidad.',
      fr: 'Nous souffrons plus en imagination qu’en réalité.',
      de: 'Wir leiden mehr in der Einbildung als in Wirklichkeit.' },
    { who: 'Confucius',
      en: 'It does not matter how slowly you go, so long as you do not stop.',
      ru: 'Неважно, как медленно ты идёшь, пока ты не останавливаешься.',
      es: 'No importa lo despacio que vayas mientras no te detengas.',
      fr: 'Peu importe la lenteur, pourvu que l’on ne s’arrête pas.',
      de: 'Es ist gleich, wie langsam du gehst, solange du nicht stehen bleibst.' },
    { who: 'Rumi',
      en: 'Silence is the language of God; all else is poor translation.',
      ru: 'Тишина — язык Бога, всё остальное — плохой перевод.',
      es: 'El silencio es el idioma de Dios; lo demás es mala traducción.',
      fr: 'Le silence est la langue de Dieu, tout le reste est mauvaise traduction.',
      de: 'Stille ist die Sprache Gottes, alles andere ist schlechte Übersetzung.' },
    { who: 'Henry David Thoreau',
      en: 'It is not what you look at that matters, it is what you see.',
      ru: 'Важно не то, на что ты смотришь, а то, что ты видишь.',
      es: 'No importa lo que miras, sino lo que ves.',
      fr: 'Ce qui compte n’est pas ce que l’on regarde, mais ce que l’on voit.',
      de: 'Es zählt nicht, worauf du schaust, sondern was du siehst.' },
    { who: 'Vincent van Gogh',
      en: 'Great things are done by a series of small things brought together.',
      ru: 'Большое складывается из множества малого, сведённого вместе.',
      es: 'Las grandes cosas se hacen de pequeñas cosas reunidas.',
      fr: 'Les grandes choses se font d’une suite de petites choses réunies.',
      de: 'Großes entsteht aus vielen kleinen Dingen, die zusammenkommen.' },
    { who: 'Anton Chekhov',
      en: 'Brevity is the sister of talent.',
      ru: 'Краткость — сестра таланта.',
      es: 'La brevedad es hermana del talento.',
      fr: 'La brièveté est la sœur du talent.',
      de: 'Kürze ist die Schwester des Talents.' },
    { who: 'Marie Curie',
      en: 'Nothing in life is to be feared, it is only to be understood.',
      ru: 'В жизни нет ничего, чего стоит бояться, есть лишь то, что надо понять.',
      es: 'Nada en la vida debe temerse, solo comprenderse.',
      fr: 'Rien dans la vie n’est à craindre, tout est à comprendre.',
      de: 'Nichts im Leben ist zu fürchten, es ist nur zu verstehen.' },
    { who: 'Albert Einstein',
      en: 'The important thing is not to stop questioning.',
      ru: 'Главное — не переставать задавать вопросы.',
      es: 'Lo importante es no dejar de hacer preguntas.',
      fr: 'L’important est de ne jamais cesser de questionner.',
      de: 'Das Wichtigste ist, nicht aufzuhören zu fragen.' },
    { who: 'Simone Weil',
      en: 'Attention is the rarest and purest form of generosity.',
      ru: 'Внимание — самая редкая и чистая форма щедрости.',
      es: 'La atención es la forma más rara y pura de generosidad.',
      fr: 'L’attention est la forme la plus rare et la plus pure de la générosité.',
      de: 'Aufmerksamkeit ist die seltenste und reinste Form der Großzügigkeit.' },
    { who: 'Rainer Maria Rilke',
      en: 'Be patient toward all that is unsolved in your heart.',
      ru: 'Будьте терпеливы ко всему нерешённому в вашем сердце.',
      es: 'Ten paciencia con todo lo que aún no está resuelto en tu corazón.',
      fr: 'Soyez patient envers tout ce qui n’est pas résolu dans votre cœur.',
      de: 'Haben Sie Geduld mit allem Ungelösten in Ihrem Herzen.' }
  ],

  /* два праздника рядом по календарю, если сегодня пусто */
  pick: function (date, lang) {
    var mm = String(date.getMonth() + 1).padStart(2, '0');
    var dd = String(date.getDate()).padStart(2, '0');
    var today = this.holidays[mm + '-' + dd];
    var out = [];
    if (today) out.push(today[lang] || today.en);
    var keys = Object.keys(this.holidays).sort();
    var here = mm + '-' + dd;
    for (var i = 0; i < keys.length && out.length < 3; i++) {
      var k = keys.find ? keys[i] : keys[i];
      if (k === here) continue;
      if (k > here) { var h = this.holidays[k]; out.push((h[lang] || h.en)); }
    }
    while (out.length < 3) {
      var kk = keys[out.length % keys.length], hh = this.holidays[kk];
      out.push(hh[lang] || hh.en);
    }
    return { today: !!today, list: out.slice(0, 3) };
  },

  twoQuotes: function (date, lang) {
    var day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    var n = this.quotes.length;
    var a = this.quotes[(day * 2) % n], b = this.quotes[(day * 2 + 1) % n];
    return [
      { text: a[lang] || a.en, who: a.who },
      { text: b[lang] || b.en, who: b.who }
    ];
  }
};
