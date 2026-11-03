import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from sqlalchemy.orm import Session

from app.api.deps import anyone
from app.db.session import get_db
from app.services import stats

router = APIRouter(prefix="/reports", tags=["reports"], dependencies=[Depends(anyone)])


def _params(frm: str | None, to: str | None):
    cur = stats.current_cycle()
    return frm or stats.shift(cur, -5), to or cur


@router.get("")
def report(frm: str | None = None, to: str | None = None, zone_id: int | None = None,
           auditor_id: int | None = None, category: str | None = None, status: str | None = None,
           db: Session = Depends(get_db)):
    f, t = _params(frm, to)
    return stats.report(db, f, t, zone_id, auditor_id, category, status)


@router.get("/export.xlsx")
def export_xlsx(frm: str | None = None, to: str | None = None, zone_id: int | None = None,
                auditor_id: int | None = None, category: str | None = None, status: str | None = None,
                db: Session = Depends(get_db)):
    f, t = _params(frm, to)
    r = stats.report(db, f, t, zone_id, auditor_id, category, status)
    wb = Workbook()
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="0B5FA5")

    ws = wb.active
    ws.title = "Monthly trend"
    ws.append(["Month", "Raised", "Closed", "Open at month end", "Overdue", "Avg closure (d)", "Audit compliance %"])
    for m in r["months"]:
        ws.append([m["label"], m["raised"], m["closed"], m["open"], m["overdue"], m["avg"], m["comp"]])

    ws2 = wb.create_sheet("Issues")
    ws2.append(["Issue ID", "Finding", "Zone", "5S", "Priority", "Raised by", "Raised on", "Days open", "Status"])
    for i in r["issues"]:
        ws2.append([i["code"], i["description"], i["zone"], i["category"], i["priority"], i["raised_by"],
                    i["raised_on"], i["days"], i["status"]])
    for sheet in (ws, ws2):
        for c in sheet[1]:
            c.font, c.fill = head, fill
        for col in sheet.columns:
            sheet.column_dimensions[col[0].column_letter].width = max(12, min(42, max(len(str(c.value or "")) for c in col) + 2))

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=vijay-5s-report-{f}-to-{t}.xlsx"})
