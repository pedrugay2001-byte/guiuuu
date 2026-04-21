#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  FarmaClube — app mobile (Expo + FastAPI + MongoDB) para compra exclusiva de emagrecedores,
  peptídeos e produtos Landerlan. Acesso via código de convite (gate) com geração recursiva
  de códigos para cada novo membro. Design dark/black moderno. Agora estamos implementando
  Checkout via Chat Interno (substituindo WhatsApp) com painel de staff para responder.

backend:
  - task: "Orders + In-App Chat endpoints"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Novos endpoints implementados:
            - POST /api/orders (cria pedido + mensagem resumo automática na thread do membro)
            - GET  /api/chat/member/{member_id}   (mensagens — acesso do membro, sem auth)
            - POST /api/chat/member/{member_id}   (membro envia mensagem)
            - GET  /api/chat/threads              (lista threads — staff/admin auth)
            - GET  /api/chat/support/{member_id}  (staff lê thread, marca como lida)
            - POST /api/chat/support/{member_id}  (staff responde)
            - GET  /api/orders/member/{member_id}
            Seed de usuário suporte: suporte@farmaclube.com / suporte123 (role=support).
            Helpers `require_staff` permite admin ou support.
            Precisa validação: criar pedido, verificar mensagem inicial, troca de mensagens nos dois sentidos, listagem de threads, proteção de auth.

frontend:
  - task: "Checkout Chat + Staff Inbox UI"
    implemented: true
    working: "NA"
    file: "frontend/app/chat.tsx, frontend/src/chat-room.tsx, frontend/app/staff/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: |
            Ajustado bug de import em src/chat-room.tsx (paths relativos estavam ../../src em vez de ./).
            Checkout do carrinho agora chama createOrder + router.push('/chat').
            Staff login/inbox/chat verificados visualmente (screenshots OK).
            Testes de frontend serão executados somente após confirmação do usuário.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Orders + In-App Chat endpoints"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: |
        Por favor testar apenas os endpoints novos de pedidos e chat no backend.
        Fluxo esperado:
         1) POST /api/members/enter com code X2T → obter member_id
         2) POST /api/orders com 2 itens → retorna order_id, status=open. Deve criar mensagem inicial.
         3) POST /api/auth/login com suporte@farmaclube.com/suporte123 → token
         4) GET /api/chat/threads (Bearer) → lista com 1 thread do membro, unread>=1
         5) GET /api/chat/support/{member_id} (Bearer) → lista mensagens, marca como lidas
         6) POST /api/chat/support/{member_id} (Bearer) com {"text":"olá"} → mensagem com sender=support
         7) GET /api/chat/member/{member_id} (sem auth) → vê resposta do suporte
         8) POST /api/chat/member/{member_id} com {"text":"obrigado"} → aparece na thread
         9) GET /api/chat/threads sem auth → deve retornar 401/403
        Não fazer mudanças — apenas validar.