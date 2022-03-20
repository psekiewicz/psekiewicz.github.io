zawodnicy = [
    { id: "uczen", imie: "Uczeń" }
];
pytania = [
    {
        tresc: "Co oznacza słowo 'sausage'?",
        odpowiedzi: [
            {
                tresc: "sos",
                punkty: []
            },
            {
                tresc: "parówki",
                punkty: []
            },
            {
                tresc: "ser",
                punkty: []
            },
            {
                tresc: "kiełbaski",
                punkty: [
                    { zawodnik: "uczen", wartosc: 1 }
                ]
            }
        ]
    },
    {
        tresc: "Co oznacza słowo 'cheese'?",
        odpowiedzi: [
            {
                tresc: "szynka",
                punkty: []
            },
            {
                tresc: "ser",
                punkty: [
                    { zawodnik: "uczen", wartosc: 1 }
                ]
            },
            {
                tresc: "marchewka",
                punkty: []
            },
            {
                tresc: "ogórek",
                punkty: []
            }
        ]
    },
    {
        tresc: "Po angielsku 'marchewka' to:",
        odpowiedzi: [
            {
                tresc: "ham",
                punkty: []
            },
            {
                tresc: "march",
                punkty: []
            },
            {
                tresc: "carrot",
                punkty: [
                    { zawodnik: "uczen", wartosc: 1 }
                ]
            },
            {
                tresc: "parot",
                punkty: []
            }
        ]
    }
];

function restart() {
    zawodnicy = zawodnicy.map(
        zawodnik => ({ ...zawodnik, podobienstwo: 0})
    );
    nrPytania = -1;
    zaladujPytanie();
}
function zaladujPytanie() {
    nrPytania++;

    document.getElementById("odpowiedzi").innerHTML = "";

    if (nrPytania < pytania.length) {

        document.getElementById("naglowek").innerHTML = pytania[nrPytania].tresc;

        pytania[nrPytania].odpowiedzi.forEach( (odpowiedz, nrOdpowiedzi) => {
            document.getElementById("odpowiedzi").innerHTML +=
                `<button class="odpowiedz" onclick="wybierzOdpowiedz(${nrOdpowiedzi})">${odpowiedz.tresc}</button>`;
        });
    }
    else {
        let podobienstwa = zawodnicy.map(zawodnik => zawodnik.podobienstwo);
        let maksPodobienstwo = Math.max(...podobienstwa);

        //let wybraniZawodnicy = zawodnicy.filter(zawodnik => zawodnik.podobienstwo == maksPodobienstwo);
        //let wynik = wybraniZawodnicy.map(zawodnik => zawodnik.imie).join(',</br> ');

        document.getElementById("naglowek").innerHTML =
        `Twoja liczba punktów to: ${maksPodobienstwo} z ${pytania.length}`;
    }
};
function wybierzOdpowiedz(nrOdpowiedzi) {
    let punkty = pytania[nrPytania]
        .odpowiedzi[nrOdpowiedzi]
        .punkty;

    console.log(punkty);

    punkty.forEach((punktyZawodnika) => {
        zawodnicy = zawodnicy.map((zawodnik) =>
            (zawodnik.id == punktyZawodnika.zawodnik ?
                {
                    ...zawodnik,
                    podobienstwo: zawodnik.podobienstwo + punktyZawodnika.wartosc
                } : zawodnik));
    });

    console.log(zawodnicy);

    zaladujPytanie();
};

restart();