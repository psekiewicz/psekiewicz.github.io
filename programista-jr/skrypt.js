zawodnicy = [
    { id: "ronaldo", imie: "Cristiano Ronaldo" },
    { id: "messi", imie: "Lionel Messi" },
    { id: "neuer", imie: "Manuel Neuer" },
    { id: "marcelo", imie: "Marcelo" },
    { id: "kante", imie: "N’Golo Kanté"}
];
pytania = [
    {
        tresc: "Na jakiej pozycji lubisz grać najbardziej?",
        odpowiedzi: [
            {
                tresc: "Bramkarz",
                punkty: [
                    { zawodnik: "neuer", wartosc: 1}
                ]
            },
            {
                tresc: "Obrońca",
                punkty: [
                    { zawodnik: "marcelo", wartosc: 1}
                ]
            },
            {
                tresc: "Pomocnik",
                punkty: [
                    { zawodnik: "kante", wartosc: 1}
                ]
            },
            {
                tresc: "Napastnik",
                punkty: [
                    { zawodnik: "ronaldo", wartosc: 1},
                    { zawodnik: "messi", wartosc: 1}
                ]
            }
        ]
    },
    {
        tresc: "Co jest dla Ciebie ważne w piłce?",
        odpowiedzi: [
            {
                tresc: "Zabawa",
                punkty: [
                    { zawodnik: "marcelo", wartosc: 3},
                    { zawodnik: "kante", wartosc: 2}
                ]
            },
            {
                tresc: "Zwyciestwo",
                punkty: []
            },
            {
                tresc: "Być w centrum uwagi",
                punkty: [
                    { zawodnik: "ronaldo", wartosc: 3}
                ]
            }
        ]
    },
    {
        tresc: "Jaka jest Twoja ulubiona liga?",
        odpowiedzi: [
            {
                tresc: "Bundesliga",
                punkty: []
            },
            {
                tresc: "Premier League",
                punkty: []
            },
            {
                tresc: "Ekstraklasa",
                punkty: []
            },
            {
                tresc: "Primera Division",
                punkty: []
            },
            {
                tresc: "Serie A",
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

        let wybraniZawodnicy = zawodnicy.filter(zawodnik => zawodnik.podobienstwo == maksPodobienstwo);
        let wynik = wybraniZawodnicy.map(zawodnik => zawodnik.imie).join(',</br> ');

        document.getElementById("naglowek").innerHTML = `Jesteś podobny do:</br></br> ${wynik}`;
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