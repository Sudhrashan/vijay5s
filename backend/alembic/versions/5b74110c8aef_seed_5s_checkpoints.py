"""seed 5s checkpoints

Source: ROE004-5s Check List -2026.xlsx, sheet "Checklist" (plant's printed 5S audit form).
Score criteria: 0 Initial Situation, 0.5 First Improvements, 1 Development, 1.5 Integrated
System, 2 Excellence. 34 questions, max 68 points.

Revision ID: 5b74110c8aef
Revises: 76ed6e11024c
Create Date: 2026-11-01 20:18:37.599702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b74110c8aef'
down_revision: Union[str, None] = '76ed6e11024c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

checkpoints_table = sa.table(
    "checkpoints",
    sa.column("category", sa.String),
    sa.column("order", sa.Integer),
    sa.column("text", sa.Text),
)

CHECKPOINTS = [
    ("1S", 1, "Is the workplace cluttered with unnecessary pallets, raw materials, drums, inventory or finished products?"),
    ("1S", 2, "Are there any obsolete products in the workplace?"),
    ("1S", 3, "Have chemicals and consumables been sorted according to their use and their nature?"),
    ("1S", 4, "Are there any Un wanted Materials in work area? (like tools, jigs, dies, moulds or accessories, wrenches, scrapers, gloves...)"),
    ("1S", 5, "Is it possible to distinguish between needed and unneeded items?"),
    ("1S", 6, "Are there any unused machines or other equipment in the workplace? (worktables, shelving, packing machine, etc)."),
    ("1S", 7, "Are there any unneeded or obsolete instructions, procedures, memos, drawings or visual displays in the file cabinets, on the workstation and on the walls?"),

    ("2S", 1, "Are production units, workshops, machines, piping, production lines and processes clearly identified and visually displayed?"),
    ("2S", 2, "Are required tools arranged properly for operations and ordered rationally, in order that they can be easily taken and returned into place, depending on how often and where they are used?"),
    ("2S", 3, "Are there any markings to clearly identify floor areas, aisles, walkways, scrap and storage spaces?"),
    ("2S", 4, "Are there labels indicating all items location and their quantities on shelves?"),
    ("2S", 5, "Are PPE* and safety materials arranged rationally and easily-accessible?"),
    ("2S", 6, "Are all documents essential to the activity well-arranged and clearly identified?"),

    ("3S", 1, "Are cleaning tools, equipment materials available, accessible and adapted?"),
    ("3S", 2, "Are machines, workstations, piping, cabinets, shelves clean?"),
    ("3S", 3, "Have contamination and dirt causes (leaks, dust) been identified and treated?"),
    ("3S", 4, "Are floors, aisles and scraps, scrap areas clean?"),
    ("3S", 5, "Is cleanliness a usual team concern?"),
    ("3S", 6, "Is Prescribed/documented procedure/schedule for maintenance, cleaning and sanitization"),
    ("3S", 7, "Is cleaning an ongoing team activity with proper check list & Responsibility?"),

    ("4S", 1, "Are there existing standards and a shared coding system for areas, tools, pipes and equipment markings?"),
    ("4S", 2, "Have cleaning routines, Orderliness standards and inspection routines been visually standardized?"),
    ("4S", 3, "Are production rules operating procedures and safety standards, clear and accessible & visually displayed?"),
    ("4S", 4, "Are there dangerous activities in the work place that have not been defined and visualized by a standard?"),
    ("4S", 5, "Are there standards for the management and supplying of consumables, chemical, Packaging materials, outside visitors and raw materials?"),
    ("4S", 6, "Are proper names displayed for the locations, products, utilities, equipments & instruments on the walls or boards or on its?"),
    ("4S", 7, "Is the current working process matched with the approved SOP?"),

    ("5S", 1, "Is there a formal 7S program with management commitment?"),
    ("5S", 2, "Is the 7S vision shared in the plant?"),
    ("5S", 3, "Are targets clearly communicated through internal meeting & documented?"),
    ("5S", 4, "Are there an audit system and a reporting system in place?"),
    ("5S", 5, "Have all operators/workers been trained to the 5S and is there a continuous 5S team activity all over the plant, with a regular audit plan clearly defined for all the teams?"),
    ("5S", 6, "Have improvement suggestions, projects and action plans been structured and visually displayed, and are they visible to everyone?"),
    ("5S", 7, "Is everyone informed of the work place past and present achievements?"),
]


def upgrade() -> None:
    op.bulk_insert(
        checkpoints_table,
        [{"category": c, "order": o, "text": t} for c, o, t in CHECKPOINTS],
    )


def downgrade() -> None:
    op.execute(checkpoints_table.delete())
