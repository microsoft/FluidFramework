// nodelib.cpp : Defines the entry point for the application.
//

#include "stdafx.h"
#include <shellapi.h>
#include <io.h>
#include <codecvt>
#include "nodelib.h"
#include "node.h"
#include "uv.h"
#include "libplatform/libplatform.h"
#include "v8.h"

#define MAX_LOADSTRING 100

#define IDM_INSERT 200
#define IDM_REMOVE 201
#define IDM_ADDMARKER 202

using namespace v8;
using namespace node;

static bool force_async_hooks_checks = false;
static bool trace_sync_io = false;
static bool abort_on_uncaught_exception = false;

// Global Variables:
HINSTANCE hInst;                                // current instance
WCHAR szTitle[MAX_LOADSTRING];                  // The title bar text
WCHAR szWindowClass[MAX_LOADSTRING];            // the main window class name

// Forward declarations of functions included in this code module:
ATOM                MyRegisterClass(HINSTANCE hInstance);
BOOL                InitInstance(HINSTANCE, int);
LRESULT CALLBACK    WndProc(HWND, UINT, WPARAM, LPARAM);
INT_PTR CALLBACK    About(HWND, UINT, WPARAM, LPARAM);

HWND textEdit;
HWND positionEdit;
HWND hWnd;
HWND positionEndEdit;

// To store any attached objects
Persistent<Object> attachedJSObject;
Persistent<Object>  attachedJSObjectRoot;
Persistent<Object> attachedJSObjectComment;
Persistent<Object> attachedDocFactoryObj;
Persistent<Context> runningContext;
Isolate* runningIsolate;

std::wstring currentText;

static void ListenForUpdates(Isolate* isolate, Local<Object> attached);

namespace node {
    void DumpBacktrace(FILE* fp) {
    }
}  // namespace node
Local<Object> EnsurePragueMap(v8::Local<Object> mapParentView, const wchar_t *xszKey);
static void ViewAvailable(const v8::FunctionCallbackInfo<v8::Value>& args)
{
	if (args.Length() < 1)
	{
		args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), false));
	}

	Isolate* isolate = args.GetIsolate();
	HandleScope scope(isolate);

	Local<Object> attached = args[0]->ToObject();
	Local<Object> commentMap = EnsurePragueMap(attached, L"1234");

	args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), true));
}

Local<Object> EnsurePragueMap(v8::Local<Object> mapParentView, const wchar_t *xszKey) 
{
	Local<Context> context = runningContext.Get(runningIsolate);

	std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
	std::string utf8String = converter.to_bytes(xszKey);

	Local<FunctionTemplate> functionTemplate = FunctionTemplate::New(runningIsolate, ViewAvailable);
	Local<Function> function = functionTemplate->GetFunction();

	context->Global()->Set(String::NewFromUtf8(runningIsolate, "testprague"), function);

	Local<Function> ensuremap = Local<Function>::Cast(mapParentView->Get(String::NewFromUtf8(runningIsolate, "EnsureSharedMapView")));
	const int argc = 1;
	v8::Local<v8::Value> argv[argc] =
	{
		v8::String::NewFromUtf8(runningIsolate, &utf8String[0])
	};

	Local<Object> ret = ensuremap->Call(mapParentView, argc, argv)->ToObject();

	return ret;

}
void TraverseProperties(Local<Value> val, Isolate *isolate, Local<Context> context, int iLevel)
{
    if (val->IsObject()) {
        //Local<Context> context = Context::New(isolate);
        Local<Object> object = val->ToObject();
        MaybeLocal<Array> maybe_props = object->GetOwnPropertyNames(context);
        if (!maybe_props.IsEmpty()) {
            Local<Array> props = maybe_props.ToLocalChecked();
            for (uint32_t i = 0; i < props->Length(); i++) {
                Local<Value> key = props->Get(i);
                Local<Value> value = object->Get(key);
                // do stuff with key / value
                String::Utf8Value utf8_key(key);
                String::Utf8Value utf8_value(value);
                iLevel;
                if (strcmp(*utf8_key, "children") && strcmp(*utf8_key, "rightmostTiles") && strcmp(*utf8_key, "leftmostTiles"))
                    TraverseProperties(value, isolate, context, iLevel + 1);
            }
        }
    }
}

static Local<Object> GetCommentSharedString(Local<Object> root)
{
	Local<Context> context = runningContext.Get(runningIsolate);

	Local<Function> ensureSharedString = Local<Function>::Cast(root->Get(String::NewFromUtf8(runningIsolate, "EnsureSharedString")));

	std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
	std::string utf8String = converter.to_bytes(L"comments");
	const int argc = 1;
	v8::Local<v8::Value> argv[argc] =
	{
		v8::String::NewFromUtf8(runningIsolate, &utf8String[0]),
	};

	Local<Object> commentsharedstring = ensureSharedString->Call(root, argc, argv)->ToObject();
	return commentsharedstring;
}


static void AttachCallback(const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Length() < 1) {
        args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), false));
    }

    Isolate* isolate = args.GetIsolate();
    HandleScope scope(isolate);

    Local<Object> attached = args[1]->ToObject();
    // Store the object in a persistent handle to keep it around after the call
    attachedJSObject.Reset(isolate, attached);

    // Add a C++ listener for updates to the object
    ListenForUpdates(isolate, attached);

	Local<Object> rootObject = args[0]->ToObject();
	attachedJSObjectRoot.Reset(isolate, rootObject);
	//Local<Object> attachedComment = GetCommentSharedString(rootObject);
	//// Store the object in a persistent handle to keep it around after the call
	//attachedJSObjectComment.Reset(isolate, attachedComment);
	//ListenForUpdates(isolate, attachedComment);

    args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), true));
}


bool FFindValue(v8::Local<v8::Object> &obj, v8::Local<v8::Value> &value, std::list<std::string> &lstProperty, std::list<std::string>::iterator it) 
{
    if (it == lstProperty.end())
        return true;

    const char *sz = it->c_str();
    Local<Context> context = runningContext.Get(runningIsolate);
    MaybeLocal<Value> mayBeValue = obj->Get(context, String::NewFromUtf8(runningIsolate, sz));
    
    // If no value match for this key, return
    Local<Value> valRet;
    if (!mayBeValue.ToLocal(&valRet))
        return false;

    it++; // Advance the iterator to find whether we have more to search for

    // we have reached the end, so return value
    if (it == lstProperty.end())
    {
        value = valRet;
        return true;
    }

    // If matching value is not an object, return false
    if (!valRet->IsObject())
        return false;
    return FFindValue(valRet->ToObject(), value, lstProperty, it);
}






static  std::list<std::string> test({ "contents", "type" });
static void OnEachStreamOp(const v8::FunctionCallbackInfo<v8::Value>& args) {
    Isolate* isolate = args.GetIsolate();
    HandleScope scope(isolate);

    Local<Object> attached = attachedJSObject.Get(runningIsolate);

    Local<Function> getText = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "getText")));

    Local<Context> context = runningContext.Get(runningIsolate);
    Local<Object> msgObj = args[2]->ToObject();
    Local<Value> val;

    std::list<std::string> lst;
    lst.push_back("contents");
    lst.push_back("text");
    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    if (FFindValue(msgObj, val, lst, lst.begin()))
    {
        Local<String> valStr = val->ToString();
        std::wstring text = converter.from_bytes(std::string(*v8::String::Utf8Value(valStr)));
    }	

    TraverseProperties(msgObj, isolate, context, 0);
	Local<v8::Integer> intVal = msgObj->ToInteger();
	int length = intVal->Value();
	(length);
	Local<Function> toString = Local<Function>::Cast(msgObj->ToObject()->Get(String::NewFromUtf8(runningIsolate, "getType")));
	const int argc = 0;
	v8::Local<v8::Value> *argv = nullptr;

	Local<String> result = toString->Call(attached, argc, argv)->ToString();

    //Isolate* isolate = args.GetIsolate();
    //HandleScope scope(isolate);
    Local<Object> opMsg = args[1]->ToObject();


    Local<String> text;
    //NewFunction(opMsg, text);

    

    /*const int argc = 0;
    v8::Local<v8::Value>* argv = nullptr;
*/
	result = getText->Call(attached, argc, argv)->ToString();

    //std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    currentText = converter.from_bytes(std::string(*v8::String::Utf8Value(result)));

	Local<Function> getClientId = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "getClientId")));
	result = getClientId->Call(attached, argc, argv)->ToString();
	std::wstring clientId = converter.from_bytes(std::string(*v8::String::Utf8Value(result)));

    InvalidateRect(hWnd, 0, TRUE);
}

static void OpenDocument(std::wstring docId) {
    Local<Context> context = runningContext.Get(runningIsolate);
    Local<Object> attached = attachedDocFactoryObj.Get(runningIsolate);

    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    std::string utf8String = converter.to_bytes(docId);
    
    Local<FunctionTemplate> functionTemplate = FunctionTemplate::New(runningIsolate, AttachCallback);
    Local<Function> function = functionTemplate->GetFunction();

    context->Global()->Set(String::NewFromUtf8(runningIsolate, "pragueAttach"), function);

    Local<Function> openDoc = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "OpenDoc")));
    const int argc = 1;
    v8::Local<v8::Value> argv[argc] =
    {
        v8::String::NewFromUtf8(runningIsolate, &utf8String[0])
    };

	openDoc->Call(attached, argc, argv);
}

static void AttachDocFactory(const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Length() < 1) {
        args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), false));
    }

    Isolate* isolate = args.GetIsolate();
    HandleScope scope(isolate);
    Local<Object> attached = args[0]->ToObject();

    // Store the object in a persistent handle to keep it around after the call
    attachedDocFactoryObj.Reset(isolate, attached);

    OpenDocument(L"jisach_2_21_04");

    args.GetReturnValue().Set(Boolean::New(args.GetIsolate(), true));
}


static void RemoveText(int pos1, int pos2)
{
	Local<Context> context = runningContext.Get(runningIsolate);
	Local<Object> attached = attachedJSObject.Get(runningIsolate);


	Local<Function> removeText = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "removeText")));
	const int argc = 2;
	v8::Local<v8::Value> argv[argc] =
	{
		v8::Number::New(runningIsolate, pos1),
		v8::Number::New(runningIsolate, pos2)
	};

	removeText->Call(attached, argc, argv);
}

static void InsertTileMarker(int pos1, std::wstring label, std::wstring id)
{
	Local<Context> context = runningContext.Get(runningIsolate);
	Local<Object> attached = attachedJSObject.Get(runningIsolate);

	std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
	std::string labelstr = converter.to_bytes(label);
	std::string idstr = converter.to_bytes(id);

	Local<Function> insertMarker = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "insertTileMarker")));
	const int argc = 3;
	v8::Local<v8::Value> argv[argc] =
	{
		v8::Number::New(runningIsolate, pos1),
		v8::String::NewFromUtf8(runningIsolate, &labelstr[0]),
		v8::String::NewFromUtf8(runningIsolate, &idstr[0]),
	};

	insertMarker->Call(attached, argc, argv);
}

static void InsertRangeMarker(int pos1, int pos2, std::wstring label, std::wstring id)
{
	Local<Context> context = runningContext.Get(runningIsolate);
	Local<Object> attached = attachedJSObject.Get(runningIsolate);

	std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
	std::string labelstr = converter.to_bytes(label);
	std::string idstr = converter.to_bytes(id);

	Local<Function> insertMarker = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "insertRangeMarker")));
	const int argc = 4;
	v8::Local<v8::Value> argv[argc] =
	{
		v8::Number::New(runningIsolate, pos1),
		v8::Number::New(runningIsolate, pos2),
		v8::String::NewFromUtf8(runningIsolate, &labelstr[0]),
		v8::String::NewFromUtf8(runningIsolate, &idstr[0]),
	};

	insertMarker->Call(attached, argc, argv);
}

static void InsertText(std::wstring text, int position) {

    HandleScope handle_scope(runningIsolate);
    Local<Context> context = runningContext.Get(runningIsolate);
    Local<Object> root = attachedJSObjectRoot.Get(runningIsolate);
	Local<Object> attached = attachedJSObject.Get(runningIsolate);// GetCommentSharedString(root);

    std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
    std::string utf8String = converter.to_bytes(text);
	Local<Object> rootMapView = attachedJSObjectRoot.Get(runningIsolate);
	Local<Object> commentsMap = EnsurePragueMap(rootMapView, L"comments");


    Local<Function> insertText = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "insertText")));
	Local<Object> props = Object::New(runningIsolate);
	props->Set(v8::String::NewFromUtf8(runningIsolate, "MyKey"), v8::String::NewFromUtf8(runningIsolate, "MyValue"));
	const int argc = 3;
    v8::Local<v8::Value> argv[argc] =
    {
        v8::String::NewFromUtf8(runningIsolate, &utf8String[0]),
        v8::Number::New(runningIsolate, position),
		props,
    };

    insertText->Call(attached, argc, argv);
}
static void OnInitialLoadLength(const v8::FunctionCallbackInfo<v8::Value>& args);
static void OnInitialLoadOfSegments(const v8::FunctionCallbackInfo<v8::Value>& args);
static void OnInitialLoadBegin(const v8::FunctionCallbackInfo<v8::Value>& args)
{

}
static void OnInitialLoadEnd(const v8::FunctionCallbackInfo<v8::Value>& args)
{
/*
	Local<Object> rootMapView = attachedJSObjectRoot.Get(runningIsolate);
	Local<Object> commentsMap = EnsurePragueMap(rootMapView, L"Comments");
	Local<Object> commentMap = EnsurePragueMap(commentsMap, L"1234");*/

}

static void ListenForUpdates(Isolate* isolate, Local<Object> attached) {
	Local<FunctionTemplate> functionTemplate = FunctionTemplate::New(runningIsolate,
		OnEachStreamOp);
	Local<Function> function1 = functionTemplate->GetFunction();

	functionTemplate = FunctionTemplate::New(runningIsolate,
		OnInitialLoadOfSegments);
	Local<Function> function2 = functionTemplate->GetFunction();

	functionTemplate = FunctionTemplate::New(runningIsolate,
		OnInitialLoadLength);
	Local<Function> function3 = functionTemplate->GetFunction();

	functionTemplate = FunctionTemplate::New(runningIsolate,
		OnInitialLoadBegin);
	Local<Function> function4 = functionTemplate->GetFunction();
	functionTemplate = FunctionTemplate::New(runningIsolate,
		OnInitialLoadEnd);
	Local<Function> function5 = functionTemplate->GetFunction();


	Local<Function> on = Local<Function>::Cast(attached->Get(String::NewFromUtf8(runningIsolate, "on")));
	const int argc = 5;
	v8::Local<v8::Value> argv[argc] =
	{
		function1,
		function2,
		function3,
		function4,
		function5
	};

	on->Call(attached, argc, argv);

}

int Start(HACCEL hAccelTable, node::NodePlatform* platform, uv_loop_t* event_loop, Isolate* isolate, IsolateData* isolate_data, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {


    runningIsolate = isolate;

    HandleScope handle_scope(isolate);

    Local<ObjectTemplate> global = ObjectTemplate::New(isolate);
    global->Set(String::NewFromUtf8(isolate, "AttachDocFactory"), FunctionTemplate::New(isolate, AttachDocFactory));

    Local<Context> context = Context::New(isolate, NULL, global);
    runningContext.Reset(isolate, context);
    Context::Scope context_scope(context);

    Environment* env = node::CreateEnvironment(isolate_data, context, argc, argv, exec_argc, exec_argv);
    /*CHECK_EQ(0, uv_key_create(&thread_local_env));
    uv_key_set(&thread_local_env, &env);*/

	bool inspectorReady = node::StartInspector(env, platform);
	if (!inspectorReady) {
		return 12;  // Signal internal error.
	}    

	node::LoadEnvironmentFull(env);

    {
        SealHandleScope seal(isolate);
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
    }

    int exit_code = node::EmitExit(env);
    node::RunAtExit(env);

    return exit_code;
}

int Start(HACCEL hAccelTable, node::NodePlatform* platform, uv_loop_t* event_loop, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {
    Isolate::CreateParams params;
    params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();

    Isolate* const isolate = Isolate::New(params);
    // isolate->AddMessageListener(OnMessage);
    // isolate->SetAbortOnUncaughtExceptionCallback(ShouldAbortOnUncaughtException);
    isolate->SetAutorunMicrotasks(false);
    // isolate->SetFatalErrorHandler(OnFatalError);

    Locker locker(isolate);
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);
    node::IsolateData* isolate_data = node::CreateIsolateData(isolate, event_loop);
    int exit_code = Start(hAccelTable, platform, event_loop, isolate, isolate_data, argc, argv, exec_argc, exec_argv);

    return exit_code;
}

bool runDefaultNodeLoop = false;

int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
    _In_opt_ HINSTANCE hPrevInstance,
    _In_ LPWSTR    lpCmdLine,
    _In_ int       nCmdShow)
{
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);

    // Create the console if it doesn't exist and then bind stdout, stderr, etc... to go to it
    RouteStdioToConsole(true);
    // ... alternatively the below code has them all target the nul device. You will need to do one of these
    // since node assumes the stdio file descriptors are valid which is not the case for a win32 gui app.
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

    if (runDefaultNodeLoop) {
        node::Start(argc, argv);
    }
    else {
        argv = uv_setup_args(argc, argv);
        int exec_argc;
        const char** exec_argv;
        node::Init(&argc, const_cast<const char**>(argv), &exec_argc, &exec_argv);

        auto platform = node::CreateAndInitializePlatform(
            /* thread_pool_size */ 4,
            uv_default_loop(),
            /* tracing_controller */ nullptr);

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

        int exit_code = Start(hAccelTable, platform, uv_default_loop(), argc, argv, exec_argc, exec_argv);

        return exit_code;
    }
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

    hWnd = CreateWindowW(szWindowClass, szTitle, WS_OVERLAPPEDWINDOW,
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
    case WM_CREATE:
    {
        HWND button = CreateWindow(
            L"BUTTON",
            L"Insert",
            WS_TABSTOP | WS_VISIBLE | WS_CHILD | BS_DEFPUSHBUTTON,
            10,
            10,
            100,
            20,
            hWnd,
            (HMENU) IDM_INSERT,
            hInst,
            NULL);

        HWND buttonDelete = CreateWindow(
            L"BUTTON",
            L"Remove",
            WS_TABSTOP | WS_VISIBLE | WS_CHILD | BS_DEFPUSHBUTTON,
            120,
            10,
            100,
            20,
            hWnd,
            (HMENU)IDM_REMOVE,
            hInst,
            NULL);

		HWND buttonMarker = CreateWindow(
			L"BUTTON",
			L"Add Marker",
			WS_TABSTOP | WS_VISIBLE | WS_CHILD | BS_DEFPUSHBUTTON,
			230,
			10,
			100,
			20,
			hWnd,
			(HMENU)IDM_ADDMARKER,
			hInst,
			NULL);
        textEdit = CreateWindow(
            L"EDIT",
            L"",
            WS_CHILD | WS_VISIBLE | WS_BORDER,
            10,
            50,
            100,
            40,
            hWnd,
            NULL,
            hInst,
            NULL);

        positionEdit = CreateWindow(
            L"EDIT",
            L"",
            WS_CHILD | WS_VISIBLE | WS_BORDER,
            10,
            100,
            100,
            40,
            hWnd,
            NULL,
            hInst,
            NULL);

        positionEndEdit = CreateWindow(
            L"EDIT",
            L"",
            WS_CHILD | WS_VISIBLE | WS_BORDER,
            120,
            100,
            100,
            40,
            hWnd,
            NULL,
            hInst,
            NULL);
    }
    break;
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
        case IDM_INSERT:
        {
            wchar_t buffer[2000];

            GetWindowText(textEdit, (LPWSTR)buffer, sizeof(buffer));
            std::wstring text(buffer);
            GetWindowText(positionEdit, (LPWSTR)buffer, sizeof(buffer));
            std::wstring position(buffer);

            int positionAsInt = std::stoi(position);
            InsertText(text, positionAsInt);
            break;
        }
        case IDM_REMOVE:
        {
            wchar_t buffer[2000];

            GetWindowText(positionEdit, (LPWSTR)buffer, sizeof(buffer));
            std::wstring wstrPos1(buffer);

            int pos1 = std::stoi(wstrPos1);

            GetWindowText(positionEndEdit, (LPWSTR)buffer, sizeof(buffer));
            std::wstring wstrPos2(buffer);

            int pos2 = std::stoi(wstrPos2);
            RemoveText(pos1, pos2);
			break;
        }
		case IDM_ADDMARKER:
		{
			wchar_t buffer[2000];

			GetWindowText(positionEdit, (LPWSTR)buffer, sizeof(buffer));
			std::wstring wstrPos1(buffer);

			int pos1 = std::stoi(wstrPos1);
			InsertTileMarker(pos1, L"tile",L"id");
			break;
		}

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
        RECT rect{ 10, 200, 400, 500 };
        DrawText(hdc, currentText.c_str(), -1, &rect, DT_LEFT | DT_WORDBREAK);
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

static void OnInitialLoadLength(const v8::FunctionCallbackInfo<v8::Value>& args)
{/*
	InsertTileMarker(0, L"para", L"1");
	InsertTileMarker(1, L"para", L"2");
	InsertRangeMarker(0, 3, L"sdtcard", L"0");
	InsertTileMarker(4, L"para", L"3");
	InsertTileMarker(5, L"para", L"4");
	InsertTileMarker(6, L"para", L"5");
	InsertRangeMarker(5, 8, L"sdtcard", L"0");
	InsertTileMarker(9, L"para", L"6");*/

}

static void OnInitialLoadOfSegments(const v8::FunctionCallbackInfo<v8::Value>& args)
{
	int a = 5;
	(a);
}