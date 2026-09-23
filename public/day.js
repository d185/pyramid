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

  /* Лёгкие поводы на каждый день — по ним и видно, что страница живая.
     Берутся по номеру дня в году, поэтому меняются каждые сутки. */
  /* Дни рождения философов, литераторов и духовных учителей.
     Имя по-русски отдельно, в остальных языках берётся латиница. */
  roles: {
    ph: { en: 'philosopher', ru: 'философ', es: 'filósofo', fr: 'philosophe', de: 'Philosoph' },
    wr: { en: 'writer', ru: 'писатель', es: 'escritor', fr: 'écrivain', de: 'Schriftsteller' },
    po: { en: 'poet', ru: 'поэт', es: 'poeta', fr: 'poète', de: 'Dichter' },
    sp: { en: 'spiritual teacher', ru: 'духовный учитель', es: 'maestro espiritual', fr: 'maître spirituel', de: 'spiritueller Lehrer' },
    sc: { en: 'scientist', ru: 'учёный', es: 'científico', fr: 'scientifique', de: 'Wissenschaftler' }
  },

  births: [
    ['01-06', 'Kahlil Gibran', 'Халиль Джебран', 'po', 1883],
    ['01-09', 'Simone de Beauvoir', 'Симона де Бовуар', 'ph', 1908],
    ['01-15', 'Molière', 'Мольер', 'wr', 1622],
    ['01-19', 'Edgar Allan Poe', 'Эдгар По', 'wr', 1809],
    ['01-25', 'Virginia Woolf', 'Вирджиния Вулф', 'wr', 1882],
    ['01-27', 'Lewis Carroll', 'Льюис Кэрролл', 'wr', 1832],
    ['02-07', 'Charles Dickens', 'Чарльз Диккенс', 'wr', 1812],
    ['02-08', 'Jules Verne', 'Жюль Верн', 'wr', 1828],
    ['02-11', 'Thomas Edison', 'Томас Эдисон', 'sc', 1847],
    ['02-12', 'Charles Darwin', 'Чарльз Дарвин', 'sc', 1809],
    ['02-15', 'Galileo Galilei', 'Галилео Галилей', 'sc', 1564],
    ['02-26', 'Victor Hugo', 'Виктор Гюго', 'wr', 1802],
    ['03-06', 'Michelangelo', 'Микеланджело', 'wr', 1475],
    ['03-14', 'Albert Einstein', 'Альберт Эйнштейн', 'sc', 1879],
    ['03-26', 'Robert Frost', 'Роберт Фрост', 'po', 1874],
    ['03-31', 'René Descartes', 'Рене Декарт', 'ph', 1596],
    ['04-02', 'Hans Christian Andersen', 'Ханс Кристиан Андерсен', 'wr', 1805],
    ['04-13', 'Seamus Heaney', 'Шеймас Хини', 'po', 1939],
    ['04-15', 'Leonardo da Vinci', 'Леонардо да Винчи', 'sc', 1452],
    ['04-22', 'Immanuel Kant', 'Иммануил Кант', 'ph', 1724],
    ['04-23', 'William Shakespeare', 'Уильям Шекспир', 'wr', 1564],
    ['05-05', 'Søren Kierkegaard', 'Сёрен Кьеркегор', 'ph', 1813],
    ['05-07', 'Rabindranath Tagore', 'Рабиндранат Тагор', 'po', 1861],
    ['05-12', 'Florence Nightingale', 'Флоренс Найтингейл', 'sc', 1820],
    ['05-22', 'Arthur Conan Doyle', 'Артур Конан Дойл', 'wr', 1859],
    ['05-25', 'Ralph Waldo Emerson', 'Ральф Уолдо Эмерсон', 'ph', 1803],
    ['05-31', 'Walt Whitman', 'Уолт Уитмен', 'po', 1819],
    ['06-06', 'Alexander Pushkin', 'Александр Пушкин', 'po', 1799],
    ['06-22', 'Erich Maria Remarque', 'Эрих Мария Ремарк', 'wr', 1898],
    ['06-28', 'Jean-Jacques Rousseau', 'Жан-Жак Руссо', 'ph', 1712],
    ['06-29', 'Antoine de Saint-Exupéry', 'Антуан де Сент-Экзюпери', 'wr', 1900],
    ['07-06', 'Dalai Lama XIV', 'Далай-лама XIV', 'sp', 1935],
    ['07-12', 'Henry David Thoreau', 'Генри Дэвид Торо', 'ph', 1817],
    ['07-18', 'Nelson Mandela', 'Нельсон Мандела', 'sp', 1918],
    ['07-26', 'Carl Jung', 'Карл Юнг', 'ph', 1875],
    ['07-28', 'Beatrix Potter', 'Беатрис Поттер', 'wr', 1866],
    ['08-15', 'Walter Scott', 'Вальтер Скотт', 'wr', 1771],
    ['08-26', 'Mother Teresa', 'Мать Тереза', 'sp', 1910],
    ['08-28', 'Johann Wolfgang von Goethe', 'Иоганн Вольфганг Гёте', 'wr', 1749],
    ['09-02', 'Hermann Hesse', 'Герман Гессе', 'wr', 1877],
    ['09-09', 'Leo Tolstoy', 'Лев Толстой', 'wr', 1828],
    ['09-21', 'H. G. Wells', 'Герберт Уэллс', 'wr', 1866],
    ['09-26', 'T. S. Eliot', 'Томас Элиот', 'po', 1888],
    ['09-30', 'Rumi', 'Руми', 'sp', 1207],
    ['10-02', 'Mahatma Gandhi', 'Махатма Ганди', 'sp', 1869],
    ['10-15', 'Friedrich Nietzsche', 'Фридрих Ницше', 'ph', 1844],
    ['10-16', 'Oscar Wilde', 'Оскар Уайльд', 'wr', 1854],
    ['10-19', 'Auguste Lumière', 'Огюст Люмьер', 'sc', 1862],
    ['10-25', 'Pablo Picasso', 'Пабло Пикассо', 'wr', 1881],
    ['11-09', 'Ivan Turgenev', 'Иван Тургенев', 'wr', 1818],
    ['11-11', 'Fyodor Dostoevsky', 'Фёдор Достоевский', 'wr', 1821],
    ['11-20', 'Selma Lagerlöf', 'Сельма Лагерлёф', 'wr', 1858],
    ['11-28', 'William Blake', 'Уильям Блейк', 'po', 1757],
    ['11-30', 'Mark Twain', 'Марк Твен', 'wr', 1835],
    ['12-03', 'Joseph Conrad', 'Джозеф Конрад', 'wr', 1857],
    ['12-10', 'Emily Dickinson', 'Эмили Дикинсон', 'po', 1830],
    ['12-11', 'Alexander Solzhenitsyn', 'Александр Солженицын', 'wr', 1918],
    ['12-16', 'Jane Austen', 'Джейн Остин', 'wr', 1775],
    ['12-21', 'Heinrich Böll', 'Генрих Бёлль', 'wr', 1917],
    ['12-27', 'Johannes Kepler', 'Иоганн Кеплер', 'sc', 1571],
    ['12-30', 'Rudyard Kipling', 'Редьярд Киплинг', 'wr', 1865]
  ],

  /* Запасной лёгкий повод, если сутки выдались пустыми */
  fun: [
    { en: 'A good day to say thank you', ru: 'Хороший день сказать спасибо', es: 'Buen día para dar las gracias', fr: 'Un bon jour pour dire merci', de: 'Ein guter Tag, danke zu sagen' },
    { en: 'Day of a long walk', ru: 'День долгой прогулки', es: 'Día de un paseo largo', fr: 'Jour d’une longue promenade', de: 'Tag des langen Spaziergangs' },
    { en: 'Day of quiet music', ru: 'День тихой музыки', es: 'Día de la música serena', fr: 'Jour de la musique calme', de: 'Tag der leisen Musik' },
    { en: 'Day to call someone first', ru: 'День позвонить первым', es: 'Día de llamar tú primero', fr: 'Jour d’appeler le premier', de: 'Tag, zuerst anzurufen' },
    { en: 'Day of an open window', ru: 'День открытого окна', es: 'Día de la ventana abierta', fr: 'Jour de la fenêtre ouverte', de: 'Tag des offenen Fensters' },
    { en: 'Day of five minutes of silence', ru: 'День пяти минут тишины', es: 'Día de cinco minutos de silencio', fr: 'Jour de cinq minutes de silence', de: 'Tag der fünf Minuten Stille' },
    { en: 'Day to look at the sky', ru: 'День посмотреть на небо', es: 'Día de mirar al cielo', fr: 'Jour de regarder le ciel', de: 'Tag, zum Himmel zu schauen' },
    { en: 'Day of the unread book', ru: 'День непрочитанной книги', es: 'Día del libro sin leer', fr: 'Jour du livre non lu', de: 'Tag des ungelesenen Buches' },
    { en: 'Day of a slow evening', ru: 'День медленного вечера', es: 'Día de una tarde lenta', fr: 'Jour d’une soirée lente', de: 'Tag des langsamen Abends' },
    { en: 'Day of an early morning', ru: 'День раннего утра', es: 'Día de la mañana temprana', fr: 'Jour du petit matin', de: 'Tag des frühen Morgens' }
  ],

  dayNumber: function (d) {
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
  },

  key: function (d) {
    return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  /* Только то, что приходится на сегодня и ближайшие сутки.
     Праздники и дни рождения вперемешку, без пометок. */
  pick: function (date, lang) {
    var self = this, out = [];
    var tomorrow = new Date(date.getTime() + 86400000);
    [date, tomorrow].forEach(function (d) {
      var k = self.key(d);
      var h = self.holidays[k];
      if (h) out.push({ text: h[lang] || h.en });
      self.births.forEach(function (b) {
        if (b[0] !== k) return;
        var role = self.roles[b[3]];
        out.push({
          text: (lang === 'ru' ? b[2] : b[1]) + ' · ' + (role[lang] || role.en) + ', ' + b[4]
        });
      });
    });
    // если сутки выдались пустыми, остаётся лёгкий повод дня
    if (out.length < 2) {
      var f = this.fun[this.dayNumber(date) % this.fun.length];
      out.push({ text: f[lang] || f.en });
    }
    return out.slice(0, 6);
  },

  twoQuotes: function (date, lang) {
    var day = this.dayNumber(date);
    var n = this.quotes.length;
    var a = this.quotes[(day * 2) % n], b = this.quotes[(day * 2 + 1) % n];
    return [
      { text: a[lang] || a.en, who: a.who },
      { text: b[lang] || b.en, who: b.who }
    ];
  }
};
