import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// Substitua pelo IP do PC que executa server.js, usando a mesma rede Wi-Fi.
// Exemplo: http://192.168.1.10:3000. Android Emulator: http://10.0.2.2:3000.
const apiBase = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.133.126.23:3000',
);
const orange = Color(0xFFF28A23);
const background = Color(0xFF111113);
const panel = Color(0xFF202023);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const CardosoApp());
}

String money(num n) => 'R\$ ${n.toStringAsFixed(2).replaceAll('.', ',')}';
String text(dynamic value) => (value ?? '').toString();

class CardosoApp extends StatelessWidget {
  const CardosoApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Cardoso • Equipe',
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: background,
      colorScheme: const ColorScheme.dark(primary: orange, surface: panel),
      useMaterial3: true,
      appBarTheme: const AppBarTheme(backgroundColor: background),
      cardTheme: CardThemeData(
        color: panel,
        margin: const EdgeInsets.symmetric(vertical: 5),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: panel,
      ),
    ),
    home: const EntryPage(),
  );
}

class Api {
  static const storage = FlutterSecureStorage();
  String? token;
  String role = 'staff';
  String username = '';
  Map<String, String> get headers => {
    'Content-Type': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Future<dynamic> request(String method, String path, [Object? body]) async {
    final url = Uri.parse('$apiBase$path');
    late http.Response response;
    try {
      if (method == 'POST') {
        response = await http.post(
          url,
          headers: headers,
          body: jsonEncode(body),
        );
      } else if (method == 'PATCH') {
        response = await http.patch(
          url,
          headers: headers,
          body: jsonEncode(body),
        );
      } else {
        response = await http.get(url, headers: headers);
      }
    } catch (_) {
      throw Exception(
        'Não foi possível conectar ao servidor. Confira o IP e o Wi-Fi.',
      );
    }
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      throw Exception(
        'Resposta inesperada do servidor (HTTP ${response.statusCode}). Confira a rota $path no backend.',
      );
    }
    if (response.statusCode == 404) {
      throw Exception(
        'Rota $path não encontrada (404). Atualize o server.js da Cardoso com as rotas /api/staff.',
      );
    }
    if (response.statusCode >= 400) {
      throw Exception(
        text(data['error']).isEmpty
            ? 'Erro HTTP ${response.statusCode}'
            : data['error'],
      );
    }
    return data;
  }

  Future<void> login(String user, String password) async {
    final data = await request('POST', '/api/staff/login', {
      'username': user,
      'password': password,
    });
    token = data['token'] as String;
    role = text(data['role']);
    username = text(data['username']);
    await storage.write(key: 'staff_token', value: token);
    await storage.write(key: 'staff_role', value: role);
    await storage.write(key: 'staff_user', value: username);
  }

  Future<bool> restore() async {
    token = await storage.read(key: 'staff_token');
    role = await storage.read(key: 'staff_role') ?? 'staff';
    username = await storage.read(key: 'staff_user') ?? '';
    if (token == null) return false;
    try {
      await request('GET', '/api/staff/orders');
      return true;
    } catch (_) {
      token = null;
      await storage.deleteAll();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await request('POST', '/api/staff/logout', {});
    } catch (_) {}
    token = null;
    await storage.deleteAll();
  }
}

final api = Api();

class EntryPage extends StatefulWidget {
  const EntryPage({super.key});
  @override
  State<EntryPage> createState() => _EntryPageState();
}

class _EntryPageState extends State<EntryPage> {
  bool waiting = true;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final authenticated = await api.restore();
    if (!mounted) return;
    setState(() => waiting = false);
    if (authenticated) _goDashboard();
  }

  void _goDashboard() => Navigator.of(
    context,
  ).pushReplacement(MaterialPageRoute(builder: (_) => const DashboardPage()));
  @override
  Widget build(BuildContext context) => waiting
      ? const Scaffold(body: Center(child: CircularProgressIndicator()))
      : LoginPage(onLogged: _goDashboard);
}

class LoginPage extends StatefulWidget {
  final VoidCallback onLogged;
  const LoginPage({super.key, required this.onLogged});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final user = TextEditingController();
  final pass = TextEditingController();
  bool loading = false;
  bool obscure = true;
  @override
  void dispose() {
    user.dispose();
    pass.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (user.text.trim().isEmpty || pass.text.isEmpty) return;
    setState(() => loading = true);
    try {
      await api.login(user.text.trim(), pass.text);
      if (mounted) widget.onLogged();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
        );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(26),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Image.asset(
                  'assets/logo.png',
                  height: 148,
                  width: 148,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 12),
                const Text(
                  'CARDOSO BURGUER HOUSE',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Painel da equipe',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white60),
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: user,
                  decoration: const InputDecoration(
                    labelText: 'Usuário',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: pass,
                  obscureText: obscure,
                  onSubmitted: (_) => submit(),
                  decoration: InputDecoration(
                    labelText: 'Senha',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => obscure = !obscure),
                      icon: Icon(
                        obscure ? Icons.visibility : Icons.visibility_off,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: loading ? null : submit,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.all(18),
                  ),
                  child: loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text(
                          'Entrar',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                ),
                const SizedBox(height: 25),
                Text(
                  'Servidor: $apiBase',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: Colors.white38),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

const labels = <String, String>{
  'recebido': 'Recebido',
  'confirmado': 'Confirmado',
  'preparando': 'Em preparo',
  'pronto': 'Pronto',
  'saiu_entrega': 'Saiu para entrega',
  'entregue': 'Entregue',
  'cancelado': 'Cancelado',
};

// O SQLite guarda created_at em UTC sem sufixo Z. Convertemos para Brasilia.
DateTime? orderDate(Map<String, dynamic> order) {
  final raw = text(order['createdAt']).trim();
  if (raw.isEmpty) return null;
  final parsed = DateTime.tryParse(
    raw.replaceFirst(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z'),
  );
  return parsed?.toUtc().subtract(const Duration(hours: 3));
}

String dayKey(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});
  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> orders = [];
  Map<String, dynamic>? summary;
  io.Socket? socket;
  Timer? polling;
  bool loading = true;
  String? error;
  String filter = 'Ativos';
  bool fetching = false;
  final Set<int> seenOrderIds = <int>{};
  bool initialOrdersLoaded = false;
  bool soundAlerts = true;
  DateTime? selectedDate;
  String dateFilter = 'Hoje';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    refresh();
    connectSocket();
    polling = Timer.periodic(
      const Duration(seconds: 25),
      (_) => refresh(silent: true),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) refresh(silent: true);
  }

  void connectSocket() {
    socket = io.io(
      apiBase,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': api.token})
          .enableReconnection()
          .build(),
    );
    socket!.on('staff:new-order', (_) {
      refresh(silent: true);
    });
    socket!.on('staff:order-updated', (_) => refresh(silent: true));
    socket!.connect();
  }

  Future<void> refresh({bool silent = false}) async {
    if (fetching) return;
    fetching = true;
    if (!silent && mounted)
      setState(() {
        loading = true;
        error = null;
      });
    try {
      final data = await api.request('GET', '/api/staff/orders');
      Map<String, dynamic>? stats;
      if (api.role == 'owner') {
        stats = Map<String, dynamic>.from(
          await api.request('GET', '/api/staff/summary'),
        );
      }
      final received = (data['orders'] as List)
          .map((x) => Map<String, dynamic>.from(x))
          .toList();
      final currentIds = received
          .map((o) => (o['orderId'] as num).toInt())
          .toSet();
      final hasNewOrder =
          initialOrdersLoaded &&
          received.any(
            (o) =>
                !seenOrderIds.contains((o['orderId'] as num).toInt()) &&
                o['status'] == 'recebido',
          );
      seenOrderIds.addAll(currentIds);
      initialOrdersLoaded = true;
      if (hasNewOrder && soundAlerts) {
        HapticFeedback.heavyImpact();
        SystemSound.play(SystemSoundType.alert);
      }
      if (mounted)
        setState(() {
          orders = received;
          summary = stats;
          error = null;
        });
    } catch (e) {
      if (mounted) setState(() => error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      fetching = false;
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> updateStatus(Map<String, dynamic> order, String next) async {
    try {
      await api.request(
        'PATCH',
        '/api/staff/orders/${order['orderId']}/status',
        {'status': next},
      );
      await refresh(silent: true);
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
        );
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    polling?.cancel();
    socket?.dispose();
    super.dispose();
  }

  Future<void> logOut() async {
    await api.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const EntryPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    // Pedidos confirmados pelo cliente desaparecem de todas as listas da equipe.
    // Permanecem no SQLite para relatórios, auditoria e histórico financeiro.
    final pendingDisplay = orders
        .where((o) => o['status'] != 'entregue')
        .toList();
    final active = pendingDisplay
        .where((o) => o['status'] != 'cancelado')
        .toList();
    final byStatus = filter == 'Ativos'
        ? active
        : filter == 'Histórico'
        ? pendingDisplay.where((o) => o['status'] == 'cancelado').toList()
        : pendingDisplay;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final visible =
        byStatus.where((o) {
          // Filtros de data pertencem exclusivamente à aba Histórico.
          if (filter != 'Histórico') return true;
          final date = orderDate(o);
          if (dateFilter == 'Todos') return true;
          if (date == null) return false;
          final day = DateTime(date.year, date.month, date.day);
          if (dateFilter == 'Hoje') return day == today;
          if (dateFilter == 'Ontem') return day == yesterday;
          if (dateFilter == 'Escolher data' && selectedDate != null) {
            return day.year == selectedDate!.year &&
                day.month == selectedDate!.month &&
                day.day == selectedDate!.day;
          }
          return false;
        }).toList()..sort(
          (a, b) => (orderDate(b) ?? DateTime(1970)).compareTo(
            orderDate(a) ?? DateTime(1970),
          ),
        );
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final order in visible) {
      final date = orderDate(order);
      final key = date == null ? 'Sem data' : dayKey(date);
      grouped.putIfAbsent(key, () => []).add(order);
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'CARDOSO • PEDIDOS',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        actions: [
          if (api.role == 'owner')
            IconButton(
              tooltip: 'Gerenciar loja e cardápio',
              icon: const Icon(Icons.storefront),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const StoreManagementPage()),
              ),
            ),
          if (api.role == 'owner')
            IconButton(
              tooltip: 'Relatório de vendas',
              icon: const Icon(Icons.bar_chart),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ReportsPage()),
              ),
            ),
          IconButton(
            tooltip: soundAlerts
                ? 'Desativar alerta de novos pedidos'
                : 'Ativar alerta de novos pedidos',
            onPressed: () => setState(() => soundAlerts = !soundAlerts),
            icon: Icon(
              soundAlerts
                  ? Icons.notifications_active
                  : Icons.notifications_off,
            ),
          ),
          IconButton(onPressed: refresh, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: logOut, icon: const Icon(Icons.logout)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Row(
              children: [
                const Icon(Icons.circle, color: Colors.green, size: 10),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    'Conectado como ${api.username} • ${api.role == 'owner' ? 'Proprietário' : 'Equipe'}',
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 15),
            Row(
              children: [
                Expanded(
                  child: metric(
                    'Pedidos ativos',
                    '${active.length}',
                    Icons.receipt_long,
                  ),
                ),
                if (api.role == 'owner') ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: metric(
                      'Pedidos hoje',
                      '${summary?['count'] ?? '—'}',
                      Icons.today,
                    ),
                  ),
                ],
              ],
            ),
            if (api.role == 'owner') ...[
              const SizedBox(height: 10),
              metric(
                'Pedidos do dia (bruto)',
                money((summary?['grossRevenue'] as num?) ?? 0),
                Icons.payments,
              ),
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  'Não significa dinheiro recebido. Pagamentos na entrega ainda precisam ser conciliados.',
                  style: TextStyle(fontSize: 11, color: Colors.white54),
                ),
              ),
            ],
            const SizedBox(height: 18),
            Wrap(
              spacing: 8,
              children: ['Ativos', 'Todos', 'Histórico']
                  .map(
                    (s) => ChoiceChip(
                      label: Text(s),
                      selected: filter == s,
                      onSelected: (_) => setState(() => filter = s),
                    ),
                  )
                  .toList(),
            ),
            if (filter == 'Histórico') ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: ['Hoje', 'Ontem', 'Escolher data', 'Todos']
                    .map(
                      (value) => ChoiceChip(
                        label: Text(
                          value == 'Escolher data' &&
                                  selectedDate != null &&
                                  dateFilter == value
                              ? 'Data: ${dayKey(selectedDate!)}'
                              : value,
                        ),
                        selected: dateFilter == value,
                        onSelected: (_) async {
                          if (value == 'Escolher data') {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: selectedDate ?? DateTime.now(),
                              firstDate: DateTime(2020),
                              lastDate: DateTime.now(),
                            );
                            if (picked != null && mounted)
                              setState(() {
                                selectedDate = picked;
                                dateFilter = value;
                              });
                          } else {
                            setState(() => dateFilter = value);
                          }
                        },
                      ),
                    )
                    .toList(),
              ),
            ],
            if (loading && orders.isEmpty)
              const Padding(
                padding: EdgeInsets.all(30),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  error!,
                  style: const TextStyle(color: Colors.redAccent),
                ),
              ),
            if (!loading && visible.isEmpty)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: Text('Nenhum pedido nesta área.')),
              ),
            ...grouped.entries.expand(
              (entry) => [
                Padding(
                  padding: const EdgeInsets.only(top: 18, bottom: 7),
                  child: Text(
                    '${entry.key} • ${entry.value.length} pedido(s)',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: orange,
                    ),
                  ),
                ),
                ...entry.value.map(orderCard),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget metric(String label, String value, IconData icon) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: panel,
      borderRadius: BorderRadius.circular(14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: orange),
        const SizedBox(height: 9),
        Text(
          value,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Colors.white60),
        ),
      ],
    ),
  );
  Widget orderCard(Map<String, dynamic> order) {
    final status = text(order['status']);
    final finished = ['entregue', 'cancelado'].contains(status);
    final items = order['items'] as List? ?? [];
    final created = orderDate(order);
    final age = created == null
        ? null
        : DateTime.now()
              .toUtc()
              .subtract(const Duration(hours: 3))
              .difference(created);
    final minutesWaiting = age == null
        ? null
        : (age.inMinutes < 0 ? 0 : age.inMinutes);
    final waitingLabel = minutesWaiting == null
        ? 'Horário indisponível'
        : minutesWaiting < 60
        ? 'Aguardando há ${minutesWaiting} min'
        : 'Aguardando há ${minutesWaiting ~/ 60}h ${minutesWaiting % 60}min';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'PEDIDO #${order['dailyNumber'] ?? order['orderId']}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Chip(label: Text(labels[status] ?? status)),
              ],
            ),
            if (!finished && minutesWaiting != null) ...[
              const SizedBox(height: 5),
              Row(
                children: [
                  Icon(
                    Icons.timer_outlined,
                    size: 17,
                    color: minutesWaiting >= 30
                        ? Colors.redAccent
                        : Colors.white70,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    waitingLabel,
                    style: TextStyle(
                      color: minutesWaiting >= 30
                          ? Colors.redAccent
                          : Colors.white70,
                      fontWeight: minutesWaiting >= 30
                          ? FontWeight.bold
                          : FontWeight.normal,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
            ],
            Text(
              text(order['customerName']),
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            Text(
              '${order['fulfillment'] == 'delivery' ? 'Entrega' : 'Retirada'} • ${text(order['phone'])}',
              style: const TextStyle(color: Colors.white70),
            ),
            if (order['fulfillment'] == 'delivery')
              Text(
                '${text(order['address'])} — ${text(order['neighborhood'])}',
              ),
            const Divider(height: 26),
            ...items.map((raw) {
              final item = Map<String, dynamic>.from(raw as Map);
              final extras = item['extras'] as List? ?? [];
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item['quantity']}x ${item['name']}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    if (extras.isNotEmpty)
                      Text(
                        '+ ${extras.map((x) => x['name']).join(', ')}',
                        style: const TextStyle(color: orange),
                      ),
                    if (text(item['observation']).isNotEmpty)
                      Text(
                        'OBS: ${item['observation']}',
                        style: const TextStyle(
                          color: Colors.amber,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                  ],
                ),
              );
            }),
            const Divider(),
            Text(
              'Pagamento: ${order['paymentMethod'] == 'dinheiro' ? 'Dinheiro' : 'Cartão na entrega'}',
            ),
            if (order['paymentMethod'] == 'dinheiro' &&
                order['changeFor'] != null) ...[
              Text('Cliente paga com: ${money(order['changeFor'] as num)}'),
              Text(
                'TROCO A ENTREGAR: ${money(((order['changeFor'] as num) - ((order['total'] as num?) ?? 0)).clamp(0, double.infinity))}',
                style: const TextStyle(
                  color: Colors.greenAccent,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
            Text(
              'TOTAL  ${money((order['total'] as num?) ?? 0)}',
              style: const TextStyle(
                fontSize: 18,
                color: orange,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (!finished) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (status == 'recebido')
                    FilledButton(
                      onPressed: () => updateStatus(order, 'confirmado'),
                      child: const Text('Confirmar'),
                    ),
                  if (status == 'confirmado')
                    FilledButton(
                      onPressed: () => updateStatus(order, 'preparando'),
                      child: const Text('Preparar'),
                    ),
                  if (status == 'preparando')
                    FilledButton(
                      onPressed: () => updateStatus(order, 'pronto'),
                      child: const Text('Marcar pronto'),
                    ),
                  if (status == 'pronto')
                    FilledButton(
                      onPressed: () => updateStatus(
                        order,
                        order['fulfillment'] == 'pickup'
                            ? 'entregue'
                            : 'saiu_entrega',
                      ),
                      child: Text(
                        order['fulfillment'] == 'pickup'
                            ? 'Entregue ao cliente'
                            : 'Saiu para entrega',
                      ),
                    ),
                  if (status == 'saiu_entrega')
                    const Text(
                      'Aguardando confirmação do cliente no site.',
                      style: TextStyle(color: Colors.amber),
                    ),
                  OutlinedButton(
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Cancelar pedido?'),
                          content: Text(
                            'Pedido #${order['dailyNumber'] ?? order['orderId']}',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Voltar'),
                            ),
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Cancelar pedido'),
                            ),
                          ],
                        ),
                      );
                      if (ok == true) updateStatus(order, 'cancelado');
                    },
                    child: const Text('Cancelar'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});
  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  DateTime date = DateTime.now();
  String period = 'day';
  Map<String, dynamic>? report;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final iso =
          '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      final result = await api.request(
        'GET',
        '/api/staff/reports?period=$period&date=$iso',
      );
      if (mounted) setState(() => report = Map<String, dynamic>.from(result));
    } catch (e) {
      if (mounted) setState(() => error = '$e'.replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totals = (report?['totals'] as Map?) ?? {};
    final payments = (report?['payments'] as List?) ?? [];
    final products = (report?['products'] as List?) ?? [];
    return Scaffold(
      appBar: AppBar(title: const Text('Relatório de vendas')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChoiceChip(
                label: const Text('Dia'),
                selected: period == 'day',
                onSelected: (_) {
                  setState(() => period = 'day');
                  load();
                },
              ),
              ChoiceChip(
                label: const Text('Mês'),
                selected: period == 'month',
                onSelected: (_) {
                  setState(() => period = 'month');
                  load();
                },
              ),
              OutlinedButton.icon(
                icon: const Icon(Icons.calendar_month),
                label: Text(dayKey(date)),
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: date,
                    firstDate: DateTime(2020),
                    lastDate: DateTime.now(),
                  );
                  if (picked != null) {
                    setState(() => date = picked);
                    load();
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (busy) const LinearProgressIndicator(),
          if (error != null)
            Text(error!, style: const TextStyle(color: Colors.redAccent)),
          if (report != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Total bruto de pedidos não cancelados',
                      style: TextStyle(color: Colors.white70),
                    ),
                    Text(
                      money((totals['gross'] as num?) ?? 0),
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: orange,
                      ),
                    ),
                    Text(
                      'Pedidos: ${totals['orders'] ?? 0}  •  Cancelados: ${totals['cancelled'] ?? 0}',
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Por forma de pagamento',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            ...payments.map(
              (x) => ListTile(
                title: Text(text(x['method'])),
                subtitle: Text('${x['orders']} pedido(s)'),
                trailing: Text(money((x['gross'] as num?) ?? 0)),
              ),
            ),
            const SizedBox(height: 18),
            const Text(
              'Produtos mais vendidos',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
            ...products.map(
              (x) => ListTile(
                title: Text(text(x['name'])),
                subtitle: Text('${x['quantity']} unidade(s)'),
                trailing: Text(money((x['gross'] as num?) ?? 0)),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Valores de pedidos registrados, não pagamentos confirmados.',
              style: TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

// Painel exclusivo do proprietário. A API valida a permissão novamente.
class StoreManagementPage extends StatefulWidget {
  const StoreManagementPage({super.key});
  @override
  State<StoreManagementPage> createState() => _StoreManagementPageState();
}

class _StoreManagementPageState extends State<StoreManagementPage> {
  bool? isOpen;
  bool saving = false;
  String? error;
  List<Map<String, dynamic>> products = [];

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final store = await api.request('GET', '/api/staff/store');
      final catalog = await api.request('GET', '/api/staff/products');
      if (mounted)
        setState(() {
          isOpen = store['open'] == true;
          products = (catalog['products'] as List)
              .map((x) => Map<String, dynamic>.from(x))
              .toList();
          error = null;
        });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> changeStore(bool value) async {
    setState(() => saving = true);
    try {
      await api.request('PATCH', '/api/staff/store', {'open': value});
      if (mounted) setState(() => isOpen = value);
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> editProduct(Map<String, dynamic> product) async {
    final name = TextEditingController(text: text(product['name']));
    final description = TextEditingController(
      text: text(product['description']),
    );
    final price = TextEditingController(
      text: (product['price'] as num).toStringAsFixed(2),
    );
    bool active = product['active'] == 1 || product['active'] == true;
    final updated = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Editar produto'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: name,
                  decoration: const InputDecoration(labelText: 'Nome'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: description,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Descrição'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: price,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(labelText: 'Preço (R\$)'),
                ),
                SwitchListTile(
                  title: const Text('Disponível no cardápio'),
                  value: active,
                  onChanged: (v) => setDialogState(() => active = v),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () {
                final amount = double.tryParse(price.text.replaceAll(',', '.'));
                if (name.text.trim().length < 2 ||
                    amount == null ||
                    amount < 0 ||
                    amount > 10000) {
                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                    const SnackBar(content: Text('Confira nome e preço.')),
                  );
                  return;
                }
                Navigator.pop(dialogContext, {
                  'name': name.text.trim(),
                  'description': description.text,
                  'price': amount,
                  'active': active,
                });
              },
              child: const Text('Salvar'),
            ),
          ],
        ),
      ),
    );
    name.dispose();
    description.dispose();
    price.dispose();
    if (updated == null) return;
    try {
      await api.request(
        'PATCH',
        '/api/staff/products/${product['id']}',
        updated,
      );
      await load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Gerenciar loja'),
      actions: [IconButton(onPressed: load, icon: const Icon(Icons.refresh))],
    ),
    body: error != null
        ? Center(child: Text(error!))
        : isOpen == null
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: SwitchListTile(
                  title: Text(isOpen! ? 'Loja aberta' : 'Loja fechada'),
                  subtitle: const Text(
                    'Fechada: clientes podem ver o cardápio, mas não fazer pedidos.',
                  ),
                  value: isOpen!,
                  onChanged: saving ? null : changeStore,
                  secondary: Icon(
                    isOpen! ? Icons.store : Icons.store_mall_directory_outlined,
                    color: orange,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Produtos e adicionais',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              ...products.map(
                (p) => Card(
                  child: ListTile(
                    title: Text(text(p['name'])),
                    subtitle: Text(
                      '${money((p['price'] as num))} • ${p['active'] == 1 || p['active'] == true ? 'Disponível' : 'Esgotado'}',
                    ),
                    trailing: const Icon(Icons.edit_outlined),
                    onTap: () => editProduct(p),
                  ),
                ),
              ),
            ],
          ),
  );
}
