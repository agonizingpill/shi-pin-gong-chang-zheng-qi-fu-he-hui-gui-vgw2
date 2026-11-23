"""Initialize the first installation from the versioned ORM schema."""
from src.config import engine
from src.models import Base


def upgrade():
    Base.metadata.create_all(engine)


if __name__ == '__main__':
    upgrade()
