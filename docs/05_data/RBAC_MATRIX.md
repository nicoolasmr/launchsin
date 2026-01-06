# RBAC Matrix

| Feature | role: owner | role: admin | role: member | role: viewer |
|---      |---          |---          |---           |---           |
| **Organization** | | | | |
| View Org | SELECT | SELECT | SELECT | SELECT |
| Update Org | UPDATE | UPDATE | - | - |
| Delete Org | DELETE | - | - | - |
| **Members** | | | | |
| Invite Member | INSERT | INSERT | - | - |
| Remove Member | DELETE | DELETE (except owners) | - | - |
| Change Role | UPDATE | UPDATE (except owners) | - | - |
| **Projects** | | | | |
| Create Project | INSERT | INSERT | - | - |
| View Project | SELECT | SELECT | SELECT | SELECT |
| Update Project | UPDATE | UPDATE | UPDATE* | - |
| Delete Project | DELETE | DELETE | - | - |
| **Audit Logs** | | | | |
| View Logs | SELECT | SELECT | - | - |

> [!NOTE]
> `member` access to update projects depends on `project_members` mapping.
