// nodelib.cpp : Defines the entry point for the application.
//

#include "stdafx.h"
#include <shellapi.h>
#include <io.h>
#include "nodelib.h"
#include "node.h"
#include "uv.h"
#include "libplatform/libplatform.h"
#include "v8.h"

#define MAX_LOADSTRING 100

// Global Variables:
HINSTANCE hInst;                                // current instance
WCHAR szTitle[MAX_LOADSTRING];                  // The title bar text
WCHAR szWindowClass[MAX_LOADSTRING];            // the main window class name

// Forward declarations of functions included in this code module:
ATOM                MyRegisterClass(HINSTANCE hInstance);
BOOL                InitInstance(HINSTANCE, int);
LRESULT CALLBACK    WndProc(HWND, UINT, WPARAM, LPARAM);
INT_PTR CALLBACK    About(HWND, UINT, WPARAM, LPARAM);

using namespace v8;
using namespace node;

class MyPlatform : public v8::Platform {
public:
    MyPlatform() {
        tracing_controller_.reset(new TracingController());
    }

    void CallOnBackgroundThread(v8::Task* task, ExpectedRuntime expected_runtime) override {
    }

    void CallOnForegroundThread(v8::Isolate* isolate, v8::Task* task) override {
    }

    void CallDelayedOnForegroundThread(v8::Isolate* isolate, v8::Task* task, double delay_in_seconds) override {
    }

    double MonotonicallyIncreasingTime() override {
        return uv_hrtime() / 1e9;
    }

    v8::TracingController* GetTracingController() override {
        return tracing_controller_.get();
    }

    std::unique_ptr<v8::TracingController> tracing_controller_;
};

int Start(HACCEL hAccelTable, uv_loop_t* event_loop, Isolate* isolate, IsolateData* isolate_data, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {
    HandleScope handle_scope(isolate);
    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    Environment* env = node::CreateEnvironment(isolate_data, context, argc, argv, exec_argc, exec_argv);
    LoadEnvironment(env);

    MSG msg;

    bool more = true;
    do
    {
        if (PeekMessage(&msg, nullptr, 0, 0, PM_NOREMOVE)) {
            if (GetMessage(&msg, nullptr, 0, 0)) {
                if (!TranslateAccelerator(msg.hwnd, hAccelTable, &msg))
                {
                    TranslateMessage(&msg);
                    DispatchMessage(&msg);
                }
            }
            else {
                more = false;
            }
        }

        if (more) {
            more = uv_run(event_loop, UV_RUN_NOWAIT);
            if (more == false)
            {
                node::EmitBeforeExit(env);

                // Emit `beforeExit` if the loop became alive either after emitting
                // event, or after running some callbacks.
                more = uv_loop_alive(event_loop);
                if (uv_run(event_loop, UV_RUN_NOWAIT) != 0)
                    more = true;
            }
        }
    } while (more == true);

    int exit_code = node::EmitExit(env);
    node::RunAtExit(env);

    return exit_code;
}

// Redirect function coming from
// https://chromium.googlesource.com/chromium/src/base/+/master/process/launch_win.cc
void RouteStdioToConsole(bool create_console_if_not_found) {
    // Don't change anything if stdout or stderr already point to a
    // valid stream.
    //
    // If we are running under Buildbot or under Cygwin's default
    // terminal (mintty), stderr and stderr will be pipe handles.  In
    // that case, we don't want to open CONOUT$, because its output
    // likely does not go anywhere.
    //
    // We don't use GetStdHandle() to check stdout/stderr here because
    // it can return dangling IDs of handles that were never inherited
    // by this process.  These IDs could have been reused by the time
    // this function is called.  The CRT checks the validity of
    // stdout/stderr on startup (before the handle IDs can be reused).
    // _fileno(stdout) will return -2 (_NO_CONSOLE_FILENO) if stdout was
    // invalid.
    if (_fileno(stdout) >= 0 || _fileno(stderr) >= 0) {
        // _fileno was broken for SUBSYSTEM:WINDOWS from VS2010 to VS2012/2013.
        // http://crbug.com/358267. Confirm that the underlying HANDLE is valid
        // before aborting.

        intptr_t stdout_handle = _get_osfhandle(_fileno(stdout));
        intptr_t stderr_handle = _get_osfhandle(_fileno(stderr));
        if (stdout_handle >= 0 || stderr_handle >= 0)
            return;
    }

    if (!AttachConsole(ATTACH_PARENT_PROCESS)) {
        unsigned int result = GetLastError();
        // Was probably already attached.
        if (result == ERROR_ACCESS_DENIED)
            return;
        // Don't bother creating a new console for each child process if the
        // parent process is invalid (eg: crashed).
        if (result == ERROR_GEN_FAILURE)
            return;
        if (create_console_if_not_found) {
            // Make a new console if attaching to parent fails with any other error.
            // It should be ERROR_INVALID_HANDLE at this point, which means the
            // browser was likely not started from a console.
            AllocConsole();
        }
        else {
            return;
        }
    }

    // Arbitrary byte count to use when buffering output lines.  More
    // means potential waste, less means more risk of interleaved
    // log-lines in output.
    enum { kOutputBufferSize = 64 * 1024 };

    if (freopen("CONOUT$", "w", stdout)) {
        setvbuf(stdout, nullptr, _IOLBF, kOutputBufferSize);
        // Overwrite FD 1 for the benefit of any code that uses this FD
        // directly.  This is safe because the CRT allocates FDs 0, 1 and
        // 2 at startup even if they don't have valid underlying Windows
        // handles.  This means we won't be overwriting an FD created by
        // _open() after startup.
        _dup2(_fileno(stdout), 1);
    }
    if (freopen("CONOUT$", "w", stderr)) {
        setvbuf(stderr, nullptr, _IOLBF, kOutputBufferSize);
        _dup2(_fileno(stderr), 2);
    }

    // Fix all cout, wcout, cin, wcin, cerr, wcerr, clog and wclog.
    std::ios::sync_with_stdio();
}

int Start(HACCEL hAccelTable, uv_loop_t* event_loop, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {
    Isolate::CreateParams params;
    params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();

    Isolate* const isolate = Isolate::New(params);
    isolate->SetAutorunMicrotasks(false);

    Locker locker(isolate);
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);
    node::IsolateData* isolate_data = node::CreateIsolateData(isolate, event_loop);
    int exit_code = Start(hAccelTable, event_loop, isolate, isolate_data, argc, argv, exec_argc, exec_argv);

    return exit_code;
}

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
    _In_opt_ HINSTANCE hPrevInstance,
    _In_ LPWSTR    lpCmdLine,
    _In_ int       nCmdShow)
{
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);

    RouteStdioToConsole(true);
    //for (int fd = 0; fd <= 2; ++fd) {
    //    auto handle = reinterpret_cast<HANDLE>(_get_osfhandle(fd));
    //    if (handle == INVALID_HANDLE_VALUE ||
    //        GetFileType(handle) == FILE_TYPE_UNKNOWN) {
    //        // Ignore _close result. If it fails or not depends on used Windows
    //        // version. We will just check _open result.
    //        _close(fd);
    //        if (fd != _open("nul", _O_RDWR))
    //            return 1;
    //    }
    //}

    int argc = 0;
    wchar_t** wargv = ::CommandLineToArgvW(::GetCommandLineW(), &argc);
    // Convert argv to to UTF8
    char** argv = new char*[argc];
    for (int i = 0; i < argc; i++) {
        // Compute the size of the required buffer
        DWORD size = WideCharToMultiByte(CP_UTF8,
            0,
            wargv[i],
            -1,
            NULL,
            0,
            NULL,
            NULL);
        if (size == 0) {
            // This should never happen.
            fprintf(stderr, "Could not convert arguments to utf8.");
            exit(1);
        }
        // Do the actual conversion
        argv[i] = new char[size];
        DWORD result = WideCharToMultiByte(CP_UTF8,
            0,
            wargv[i],
            -1,
            argv[i],
            size,
            NULL,
            NULL);
        if (result == 0) {
            // This should never happen.
            fprintf(stderr, "Could not convert arguments to utf8.");
            exit(1);
        }
    }

    argv = uv_setup_args(argc, argv);
    int exec_argc;
    const char** exec_argv;
    node::Init(&argc, const_cast<const char**>(argv), &exec_argc, &exec_argv);

    v8::V8::InitializePlatform(new MyPlatform());
    v8::V8::Initialize();

    // Initialize global strings
    LoadStringW(hInstance, IDS_APP_TITLE, szTitle, MAX_LOADSTRING);
    LoadStringW(hInstance, IDC_NODELIB, szWindowClass, MAX_LOADSTRING);
    MyRegisterClass(hInstance);

    // Perform application initialization:
    if (!InitInstance(hInstance, nCmdShow))
    {
        return FALSE;
    }

    HACCEL hAccelTable = LoadAccelerators(hInstance, MAKEINTRESOURCE(IDC_NODELIB));

    int exit_code = Start(hAccelTable, uv_default_loop(), argc, argv, exec_argc, exec_argv);

    return exit_code;
}

//
//  FUNCTION: MyRegisterClass()
//
//  PURPOSE: Registers the window class.
//
ATOM MyRegisterClass(HINSTANCE hInstance)
{
    WNDCLASSEXW wcex;

    wcex.cbSize = sizeof(WNDCLASSEX);

    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.cbClsExtra = 0;
    wcex.cbWndExtra = 0;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIcon(hInstance, MAKEINTRESOURCE(IDI_NODELIB));
    wcex.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wcex.lpszMenuName = MAKEINTRESOURCEW(IDC_NODELIB);
    wcex.lpszClassName = szWindowClass;
    wcex.hIconSm = LoadIcon(wcex.hInstance, MAKEINTRESOURCE(IDI_SMALL));

    return RegisterClassExW(&wcex);
}

//
//   FUNCTION: InitInstance(HINSTANCE, int)
//
//   PURPOSE: Saves instance handle and creates main window
//
//   COMMENTS:
//
//        In this function, we save the instance handle in a global variable and
//        create and display the main program window.
//
BOOL InitInstance(HINSTANCE hInstance, int nCmdShow)
{
    hInst = hInstance; // Store instance handle in our global variable

    HWND hWnd = CreateWindowW(szWindowClass, szTitle, WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, 0, CW_USEDEFAULT, 0, nullptr, nullptr, hInstance, nullptr);

    if (!hWnd)
    {
        return FALSE;
    }

    ShowWindow(hWnd, nCmdShow);
    UpdateWindow(hWnd);

    return TRUE;
}

//
//  FUNCTION: WndProc(HWND, UINT, WPARAM, LPARAM)
//
//  PURPOSE:  Processes messages for the main window.
//
//  WM_COMMAND  - process the application menu
//  WM_PAINT    - Paint the main window
//  WM_DESTROY  - post a quit message and return
//
//
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
    switch (message)
    {
    case WM_COMMAND:
    {
        int wmId = LOWORD(wParam);
        // Parse the menu selections:
        switch (wmId)
        {
        case IDM_ABOUT:
            DialogBox(hInst, MAKEINTRESOURCE(IDD_ABOUTBOX), hWnd, About);
            break;
        case IDM_EXIT:
            DestroyWindow(hWnd);
            break;
        default:
            return DefWindowProc(hWnd, message, wParam, lParam);
        }
    }
    break;
    case WM_PAINT:
    {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hWnd, &ps);
        // TODO: Add any drawing code that uses hdc here...
        EndPaint(hWnd, &ps);
    }
    break;
    case WM_DESTROY:
        PostQuitMessage(0);
        break;
    default:
        return DefWindowProc(hWnd, message, wParam, lParam);
    }
    return 0;
}

// Message handler for about box.
INT_PTR CALLBACK About(HWND hDlg, UINT message, WPARAM wParam, LPARAM lParam)
{
    UNREFERENCED_PARAMETER(lParam);
    switch (message)
    {
    case WM_INITDIALOG:
        return (INT_PTR)TRUE;

    case WM_COMMAND:
        if (LOWORD(wParam) == IDOK || LOWORD(wParam) == IDCANCEL)
        {
            EndDialog(hDlg, LOWORD(wParam));
            return (INT_PTR)TRUE;
        }
        break;
    }
    return (INT_PTR)FALSE;
}
