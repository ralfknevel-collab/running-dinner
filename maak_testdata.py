#!/usr/bin/env python3
"""Maakt een testbestand met fictieve koppels (geen echte persoonsgegevens).

Gebruik: python maak_testdata.py [aantal] [bestand]    standaard: 48 testdata/deelnemers_fictief.csv
"""
import csv
import random
import sys
from pathlib import Path

VOORNAMEN = ["Anna", "Bram", "Carlijn", "Daan", "Eva", "Finn", "Greetje", "Hugo", "Iris", "Jesse", "Kim", "Lars",
             "Marit", "Niels", "Olga", "Pim", "Roos", "Sem", "Tessa", "Ward", "Yara", "Ruben", "Lotte", "Mees",
             "Sanne", "Thijs", "Fleur", "Joris", "Noor", "Stijn", "Vera", "Koen", "Lisa", "Gijs", "Maud", "Teun"]
ACHTERNAMEN = ["Testman", "Voorbeeld", "Proefsma", "Fictief", "Demoor", "Oefenaar", "Modelstra", "Verzonnen",
               "Namaak", "Placebo", "Speelveld", "Dummink"]
STRATEN = ["Kastanjelaan", "Molenweg", "Dorpsstraat", "Beukenhof", "Zonnebloemstraat", "Parklaan", "Kerkpad",
           "Lindenplein", "Wilgenhof", "Schoolstraat"]
WENSEN = ["notenallergie", "vegetarisch", "glutenvrij", "lactose-intolerant", "geen varkensvlees", "veganistisch",
          "schaaldierenallergie", "vegetarisch, geen paddenstoelen", "zwanger (geen rauwe kaas of rauw vlees)"]


def main() -> None:
    aantal = int(sys.argv[1]) if len(sys.argv) > 1 else 48
    pad = Path(sys.argv[2] if len(sys.argv) > 2 else "testdata/deelnemers_fictief.csv")
    rng = random.Random(2026)
    pad.parent.mkdir(parents=True, exist_ok=True)
    with open(pad, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["id", "namen", "adres", "email", "tweede_mailadres", "dieetwens_a", "dieetwens_b", "ronde_vorig_jaar", "beperkingen"])
        for i in range(1, aantal + 1):
            a, b = rng.sample(VOORNAMEN, 2)
            achternaam = rng.choice(ACHTERNAMEN)
            w.writerow([
                f"K{i:02d}",
                f"{a} en {b} {achternaam}",
                f"{rng.choice(STRATEN)} {rng.randint(1, 120)}, Voorbeelddorp",
                f"koppel{i:02d}@example.nl",
                f"partner{i:02d}@example.nl" if rng.random() < 0.6 else "",
                rng.choice(WENSEN) if rng.random() < 0.18 else "",  # dieetwens van de eerste persoon
                rng.choice(WENSEN) if rng.random() < 0.18 else "",  # dieetwens van de tweede persoon
                rng.randint(1, 4) if rng.random() < 0.85 else "",  # nieuwe deelnemers: leeg
                rng.choice([f"niet ronde {rng.randint(1, 4)}", f"wil ronde {rng.randint(1, 4)}"]) if rng.random() < 0.1 else "",
            ])
    print(f"{aantal} fictieve koppels geschreven naar {pad}")


if __name__ == "__main__":
    main()
