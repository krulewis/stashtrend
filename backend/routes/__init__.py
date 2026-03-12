from routes.setup import bp as setup_bp
from routes.settings import bp as settings_bp
from routes.retirement import bp as retirement_bp
from routes.groups import bp as groups_bp
from routes.budgets import bp as budgets_bp
from routes.networth import bp as networth_bp
from routes.sync import bp as sync_bp
from routes.ai_routes import bp as ai_bp
from routes.budget_builder import bp as budget_builder_bp
from routes.investments import bp as investments_bp


def register_blueprints(app):
    app.register_blueprint(setup_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(retirement_bp)
    app.register_blueprint(groups_bp)
    app.register_blueprint(budgets_bp)
    app.register_blueprint(networth_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(budget_builder_bp)
    app.register_blueprint(investments_bp)
